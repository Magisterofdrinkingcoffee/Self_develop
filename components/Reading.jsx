"use client";

import { useRef, useState } from "react";
import { Bar, Card, Del, Empty, Header, NoteArea, Seg } from "./ui";
import PdfReader from "./PdfReader";
import { dateKey, fmtDate, logMinimum, uid } from "@/lib/data";

// Upload a PDF straight from the browser to Supabase Storage using a signed URL
async function uploadPdf(file, onProgress) {
  const res = await fetch("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upload", name: file.name }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Upload failed");
  await new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", json.uploadUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 120)}`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(form);
  });
  return { path: json.path, name: file.name, size: file.size };
}

const deleteFile = (path) =>
  fetch("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", path }) }).catch(() => {});

// Record a new page position; pages beyond the furthest point count toward the reading minimum
function recordPage(d, bookId, page, totalPages) {
  const b = d.books.find((x) => x.id === bookId);
  if (!b) return 0;
  const furthest = Number(b.furthestPage ?? b.currentPage ?? 0);
  b.currentPage = page;
  if (totalPages && !b.totalPages) b.totalPages = totalPages;
  const delta = page > furthest ? page - furthest : 0;
  if (delta) {
    b.furthestPage = page;
    logMinimum(d, dateKey(), d.settings.readingMinimumId, delta);
  }
  if (b.totalPages && page >= b.totalPages && b.status !== "finished") { b.status = "finished"; b.finishedAt = dateKey(); }
  return delta;
}

export default function Reading({ data, update, storage }) {
  const [filter, setFilter] = useState("reading");
  const [f, setF] = useState({ title: "", author: "", totalPages: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState(null);
  const fileRef = useRef(null);

  const add = async (e) => {
    e.preventDefault();
    const title = f.title.trim() || (file ? file.name.replace(/\.pdf$/i, "") : "");
    if (!title) return;
    setErr("");
    let stored = null;
    if (file) {
      try { setBusy("0%"); stored = await uploadPdf(file, (p) => setBusy(`${p}%`)); }
      catch (e2) { setErr(String(e2.message || e2)); setBusy(""); return; }
      setBusy("");
    }
    const id = uid();
    update((d) => {
      d.books.unshift({
        id, title, author: f.author.trim(), totalPages: Number(f.totalPages) || 0,
        currentPage: 0, furthestPage: 0, status: "reading", notes: [], summary: "",
        startedAt: dateKey(), finishedAt: null, file: stored,
      });
    });
    setF({ title: "", author: "", totalPages: "" });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setFilter("reading");
    setOpenId(id);
  };

  const list = data.books.filter((b) => b.status === filter);
  const counts = { reading: 0, want: 0, finished: 0 };
  data.books.forEach((b) => (counts[b.status] = (counts[b.status] || 0) + 1));
  const open = data.books.find((b) => b.id === openId);

  if (open) return <BookView book={open} data={data} update={update} storage={storage} back={() => setOpenId(null)} />;

  return (
    <>
      <Header
        title="Reading"
        sub={`${counts.finished} finished · ${counts.reading} in progress`}
        right={<Seg value={filter} onChange={setFilter} options={[
          { value: "reading", label: `Reading (${counts.reading})` },
          { value: "want", label: `To read (${counts.want})` },
          { value: "finished", label: `Finished (${counts.finished})` },
        ]} />}
      />
      <Card title="Add a book">
        <form className="stack" onSubmit={add}>
          <div className="formgrid tight">
            <input placeholder="Book title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <input placeholder="Author" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
            <input type="number" inputMode="numeric" placeholder="Total pages" value={f.totalPages} onChange={(e) => setF({ ...f, totalPages: e.target.value })} />
          </div>
          <div className="row wrap">
            <label className={`btn ${storage ? "" : "disabled"}`}>
              {file ? `📄 ${file.name}` : "Attach PDF (optional)"}
              <input ref={fileRef} type="file" accept="application/pdf" hidden disabled={!storage} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <button className="btn primary" disabled={!!busy}>{busy ? `Uploading ${busy}` : "Add book"}</button>
            {!storage && <span className="muted small">Uploading books needs Supabase connected.</span>}
          </div>
          {err && <p className="err small">{err}</p>}
        </form>
      </Card>
      {list.length === 0 && <Empty>No books here yet.</Empty>}
      <div className="books">
        {list.map((b) => (
          <button key={b.id} className="book" onClick={() => setOpenId(b.id)}>
            <div className="spine" />
            <div className="grow">
              <div className="row-between"><strong>{b.title}</strong>{b.file && <span className="pill">PDF</span>}</div>
              <div className="muted small">{b.author || "Unknown author"}</div>
              <div className="muted small">
                Stopped at p. {b.currentPage || 0}{b.totalPages ? ` of ${b.totalPages}` : ""} · {b.notes.length} notes
              </div>
              <Bar value={Number(b.currentPage || 0)} max={Number(b.totalPages || 0)} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function BookView({ book, data, update, storage, back }) {
  const [page, setPage] = useState(book.currentPage || 0);
  const [note, setNote] = useState({ page: book.currentPage || "", text: "" });
  const [msg, setMsg] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const minId = data.settings.readingMinimumId;
  const linked = data.minimums.find((m) => m.id === minId);

  const edit = (patch) => update((d) => { Object.assign(d.books.find((b) => b.id === book.id), patch); });
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const savePage = (e) => {
    e.preventDefault();
    const p = Math.max(0, Number(page) || 0);
    const furthest = Number(book.furthestPage ?? book.currentPage ?? 0);
    const delta = p > furthest ? p - furthest : 0;
    update((d) => { recordPage(d, book.id, p, 0); });
    setNote((n) => ({ ...n, page: p }));
    flash(delta > 0 && linked ? `+${delta} pages added to this week's "${linked.name}"` : "Saved");
  };

  const attach = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBusy("0%");
      const stored = await uploadPdf(file, (p) => setBusy(`${p}%`));
      if (book.file?.path) deleteFile(book.file.path);
      edit({ file: stored });
      flash("PDF uploaded");
    } catch (e2) {
      flash(String(e2.message || e2));
    }
    setBusy("");
  };

  const addNote = (e) => {
    e.preventDefault();
    if (!note.text.trim()) return;
    update((d) => {
      d.books.find((x) => x.id === book.id).notes.unshift({ id: uid(), date: dateKey(), page: note.page, text: note.text.trim() });
    });
    setNote({ ...note, text: "" });
  };
  const delNote = (id) => update((d) => {
    const b = d.books.find((x) => x.id === book.id);
    b.notes = b.notes.filter((n) => n.id !== id);
  });
  const removeBook = () => {
    if (book.file?.path) deleteFile(book.file.path);
    update((d) => { d.books = d.books.filter((b) => b.id !== book.id); });
    back();
  };

  if (reading && book.file) {
    return (
      <PdfReader
        path={book.file.path}
        title={book.title}
        startPage={book.currentPage || 1}
        onPage={(p, n) => update((d) => { recordPage(d, book.id, p, n); })}
        onClose={() => { setReading(false); setPage(book.currentPage || 0); }}
      />
    );
  }

  return (
    <>
      <button className="link" onClick={back}>‹ All books</button>
      <header className="pagehead">
        <div className="grow">
          <input className="ghost h1" value={book.title} onChange={(e) => edit({ title: e.target.value })} />
          <input className="ghost muted" value={book.author} placeholder="Author" onChange={(e) => edit({ author: e.target.value })} />
        </div>
        <select value={book.status} onChange={(e) => edit({ status: e.target.value, finishedAt: e.target.value === "finished" ? dateKey() : null })}>
          <option value="reading">Reading</option>
          <option value="want">To read</option>
          <option value="finished">Finished</option>
        </select>
        <Del onClick={removeBook} label="Delete book" />
      </header>

      <Card className="readcard">
        {book.file ? (
          <div className="row-between wrapgap">
            <div>
              <strong>📄 {book.file.name}</strong>
              <div className="muted small">{(book.file.size / 1048576).toFixed(1)} MB · opens at page {book.currentPage || 1}</div>
            </div>
            <div className="row">
              <label className="btn">{busy ? `Uploading ${busy}` : "Replace PDF"}<input ref={fileRef} type="file" accept="application/pdf" hidden onChange={attach} /></label>
              <button className="btn primary" onClick={() => setReading(true)}>{book.currentPage ? "Continue reading" : "Start reading"}</button>
            </div>
          </div>
        ) : (
          <div className="row-between wrapgap">
            <span className="muted">{storage ? "Upload the PDF to read this book here." : "Connect Supabase to upload and read books here."}</span>
            <label className={`btn primary ${storage ? "" : "disabled"}`}>
              {busy ? `Uploading ${busy}` : "Upload PDF"}
              <input ref={fileRef} type="file" accept="application/pdf" hidden disabled={!storage} onChange={attach} />
            </label>
          </div>
        )}
      </Card>

      <div className="grid2">
        <div className="col">
          <Card title="Where I stopped">
            <form className="pageform" onSubmit={savePage}>
              <span className="muted">Page</span>
              <input type="number" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} />
              <span className="muted">of</span>
              <input type="number" inputMode="numeric" value={book.totalPages || ""} placeholder="?" onChange={(e) => edit({ totalPages: Number(e.target.value) || 0 })} />
              <button className="btn primary">Update</button>
            </form>
            <Bar value={Number(book.currentPage || 0)} max={Number(book.totalPages || 0)} />
            <p className="muted small">
              {msg || (book.totalPages ? `${Math.round(((book.currentPage || 0) / book.totalPages) * 100)}% · ${Math.max(0, book.totalPages - (book.currentPage || 0))} pages left` : "Add total pages to see progress")}
              {book.startedAt && ` · started ${fmtDate(book.startedAt)}`}
              {book.finishedAt && ` · finished ${fmtDate(book.finishedAt)}`}
            </p>
          </Card>
          <Card title="Summary / takeaways">
            <NoteArea rows={8} value={book.summary} placeholder="Main ideas, what you'll apply, favourite parts…" onChange={(v) => edit({ summary: v })} />
          </Card>
        </div>
        <Card title={`Notes (${book.notes.length})`}>
          <form className="noteform" onSubmit={addNote}>
            <div className="row">
              <span className="muted small">p.</span>
              <input className="pagein" type="number" inputMode="numeric" value={note.page} onChange={(e) => setNote({ ...note, page: e.target.value })} />
            </div>
            <textarea rows={3} placeholder="A note, idea or quote from this part…" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
            <button className="btn primary">Add note</button>
          </form>
          {book.notes.length === 0 && <Empty>No notes yet.</Empty>}
          <ul className="notes">
            {book.notes.map((n) => (
              <li key={n.id}>
                <div className="row-between">
                  <span className="muted small">{n.page !== "" && n.page != null ? `p. ${n.page} · ` : ""}{fmtDate(n.date)}</span>
                  <Del onClick={() => delNote(n.id)} label="Delete note" />
                </div>
                <p className="prewrap">{n.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { Bar, Card, Del, Empty, Header, NoteArea, Seg } from "./ui";
import { dateKey, fmtDate, uid } from "@/lib/data";

export default function Reading({ data, update }) {
  const [filter, setFilter] = useState("reading");
  const [f, setF] = useState({ title: "", author: "", totalPages: "" });
  const [openId, setOpenId] = useState(null);

  const add = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const id = uid();
    update((d) => {
      d.books.unshift({
        id, title: f.title.trim(), author: f.author.trim(), totalPages: Number(f.totalPages) || 0,
        currentPage: 0, status: "reading", notes: [], summary: "", startedAt: dateKey(), finishedAt: null,
      });
    });
    setF({ title: "", author: "", totalPages: "" });
    setFilter("reading");
    setOpenId(id);
  };

  const list = data.books.filter((b) => b.status === filter);
  const counts = { reading: 0, want: 0, finished: 0 };
  data.books.forEach((b) => (counts[b.status] = (counts[b.status] || 0) + 1));
  const open = data.books.find((b) => b.id === openId);

  if (open) return <BookView book={open} data={data} update={update} back={() => setOpenId(null)} />;

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
      <form className="formgrid" onSubmit={add}>
        <input placeholder="Book title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input placeholder="Author" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
        <input type="number" inputMode="numeric" placeholder="Total pages" value={f.totalPages} onChange={(e) => setF({ ...f, totalPages: e.target.value })} />
        <button className="btn primary">Add book</button>
      </form>
      {list.length === 0 && <Empty>No books here yet.</Empty>}
      <div className="books">
        {list.map((b) => (
          <button key={b.id} className="book" onClick={() => setOpenId(b.id)}>
            <div className="spine" />
            <div className="grow">
              <strong>{b.title}</strong>
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

function BookView({ book, data, update, back }) {
  const [page, setPage] = useState(book.currentPage || 0);
  const [note, setNote] = useState({ page: book.currentPage || "", text: "" });
  const [msg, setMsg] = useState("");
  const minId = data.settings.readingMinimumId;
  const linked = data.minimums.find((m) => m.id === minId);

  const edit = (patch) => update((d) => { Object.assign(d.books.find((b) => b.id === book.id), patch); });

  const savePage = (e) => {
    e.preventDefault();
    const p = Math.max(0, Number(page) || 0);
    const delta = p - Number(book.currentPage || 0);
    const today = dateKey();
    update((d) => {
      const b = d.books.find((x) => x.id === book.id);
      b.currentPage = p;
      if (b.totalPages && p >= b.totalPages && b.status !== "finished") { b.status = "finished"; b.finishedAt = today; }
      if (delta > 0 && linked) {
        d.minLog[today] = { ...(d.minLog[today] || {}), [minId]: (d.minLog[today]?.[minId] || 0) + delta };
      }
    });
    setNote((n) => ({ ...n, page: p }));
    setMsg(delta > 0 && linked ? `+${delta} pages added to today's "${linked.name}" minimum` : "Saved");
    setTimeout(() => setMsg(""), 3000);
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
  const removeBook = () => { update((d) => { d.books = d.books.filter((b) => b.id !== book.id); }); back(); };

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

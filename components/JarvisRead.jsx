"use client";

import { useState } from "react";

// Reads a PDF's text in the browser (pdf.js) and sends it to Jarvis for indexing,
// so Jarvis can answer questions and make quizzes from it. Scanned PDFs (images only) have no text to read.
async function extractText(path, onProgress) {
  const r = await fetch("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", path }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Couldn't open the PDF");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ url: j.url }).promise;
  const n = Math.min(pdf.numPages, 1500);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let text = "";
    for (const it of tc.items) text += it.str + (it.hasEOL ? "\n" : " ");
    pages.push({ page: i, text: text.replace(/[ \t]+/g, " ").trim() });
    if (i % 10 === 0) onProgress?.(Math.round((i / n) * 100));
  }
  return pages;
}

export default function JarvisRead({ book, data, update }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [subjectId, setSubjectId] = useState(book.subjectId || "");
  const idx = book.indexed;

  const run = async () => {
    setMsg("");
    try {
      setBusy("Reading 0%");
      const pages = await extractText(book.file.path, (p) => setBusy(`Reading ${p}%`));
      const chars = pages.reduce((s, p) => s + p.text.length, 0);
      if (chars < 200) throw new Error("This PDF has almost no text (probably scanned pages), so Jarvis can't read it.");
      setBusy("Indexing…");
      const r = await fetch("/api/jarvis/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "index", docId: book.id, title: book.title, subjectId, pages }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Indexing failed");
      update((d) => { Object.assign(d.books.find((b) => b.id === book.id), { subjectId, indexed: { at: new Date().toISOString(), chunks: j.chunks, smart: j.embedded } }); });
      setMsg(`Done: ${j.pages} pages in ${j.chunks} parts${j.embedded ? "" : " (keyword search only; meaning search needs the Gemini key)"}.`);
    } catch (e) {
      setMsg(String(e.message || e));
    }
    setBusy("");
  };

  const forget = async () => {
    await fetch("/api/jarvis/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", docId: book.id }) }).catch(() => {});
    update((d) => { delete d.books.find((b) => b.id === book.id).indexed; });
    setMsg("Jarvis forgot this PDF.");
  };

  return (
    <div className="jread">
      <div className="row wrap">
        <strong className="small">Jarvis {idx ? "has read this" : "hasn't read this yet"}</strong>
        {idx && <span className="muted small">{new Date(idx.at).toLocaleDateString("en-GB")} · {idx.chunks} parts</span>}
      </div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "auto" }} aria-label="Subject">
          <option value="">No subject</option>
          {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <button className="btn" onClick={run} disabled={!!busy}>{busy || (idx ? "Read again" : "Let Jarvis read it")}</button>
        {idx && !busy && <button className="link small" onClick={forget}>Forget</button>}
      </div>
      {msg && <p className="small" style={{ marginTop: 6 }}>{msg}</p>}
      {!idx && !msg && <p className="muted small" style={{ marginTop: 6 }}>Then ask: "explain chapter 3", "quiz me on this", "make flashcards from it".</p>}
    </div>
  );
}

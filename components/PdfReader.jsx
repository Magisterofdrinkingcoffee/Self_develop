"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Reads a PDF page by page. Calls onPage(page, numPages) whenever the page changes.
export default function PdfReader({ path, title, startPage = 1, onPage, onClose }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const docRef = useRef(null);
  const renderRef = useRef(null);
  const taskRef = useRef(null);
  const [num, setNum] = useState(0);
  const [page, setPage] = useState(Math.max(1, startPage || 1));
  const [input, setInput] = useState(String(Math.max(1, startPage || 1)));
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState("");

  // Load the document
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read", path }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't open the file");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: json.url });
        taskRef.current = task;
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNum(doc.numPages);
        setPage((p) => Math.min(p, doc.numPages));
        setState("ready");
      } catch (e) {
        if (!cancelled) { setErr(String(e.message || e)); setState("error"); }
      }
    })();
    return () => { cancelled = true; try { taskRef.current?.destroy(); } catch {} docRef.current = null; };
  }, [path]);

  // Render the current page to fit the width
  const render = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    renderRef.current?.cancel();
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    // Fit the whole page on screen, then apply zoom
    const fitH = (window.innerHeight - 150) * (base.width / base.height);
    const width = Math.min(wrapRef.current.clientWidth, fitH, 1000) * zoom;
    const ratio = window.devicePixelRatio || 1;
    const viewport = p.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / ratio}px`;
    canvas.style.height = `${viewport.height / ratio}px`;
    const task = p.render({ canvas, canvasContext: canvas.getContext("2d"), viewport });
    renderRef.current = task;
    try { await task.promise; } catch {}
  }, [page, zoom]);

  useEffect(() => { if (state === "ready") render(); }, [state, render]);
  useEffect(() => {
    const h = () => state === "ready" && render();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [state, render]);

  // Report page changes (also saves "where I stopped")
  useEffect(() => {
    setInput(String(page));
    if (state === "ready" && num) onPage?.(page, num);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, num, state]);

  const go = (n) => {
    if (!num) return;
    setPage(Math.min(num, Math.max(1, n)));
    wrapRef.current?.scrollIntoView({ block: "start" });
  };

  // Keyboard: arrows to turn pages, Esc to close
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="reader">
      <div className="readerbar">
        <button className="btn" onClick={onClose}><Icon name="left" size={17} />Close</button>
        <strong className="grow ellipsis">{title}</strong>
        <div className="row">
          <button className="btn" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out">−</button>
          <button className="btn" onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="readerpage" ref={wrapRef}>
        {state === "loading" && <p className="muted center-text">Opening book…</p>}
        {state === "error" && <p className="err center-text">{err}</p>}
        <canvas ref={canvasRef} className={state === "ready" ? "" : "hidden"} onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          go(e.clientX - r.left < r.width / 3 ? page - 1 : page + 1);
        }} />
      </div>
      {state === "ready" && (
        <div className="readernav">
          <button className="btn" onClick={() => go(page - 1)} disabled={page <= 1}><Icon name="left" size={17} />Prev</button>
          <form onSubmit={(e) => { e.preventDefault(); go(Number(input) || 1); }} className="row">
            <input className="pagein" type="number" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} />
            <span className="muted">/ {num}</span>
          </form>
          <button className="btn primary" onClick={() => go(page + 1)} disabled={page >= num}>Next<Icon name="right" size={17} /></button>
        </div>
      )}
    </div>
  );
}

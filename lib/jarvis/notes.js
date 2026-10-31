// Notes search (retrieval) for Jarvis: split documents into chunks, store compact embeddings,
// and rank chunks by meaning (embeddings) plus keywords. Pure functions; storage lives in server.js.

const MAX_CHUNK = 1400;

// pages: [{ page, text }] → chunks: [{ p, t }] (p = page the chunk starts on)
export function chunkPages(pages) {
  const chunks = [];
  let buf = "", start = null;
  const flush = () => {
    const t = buf.replace(/\s+/g, " ").trim();
    if (t.length > 40) chunks.push({ p: start, t });
    buf = "";
    start = null;
  };
  for (const { page, text } of pages) {
    const paras = String(text || "").split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZА-ЯЁ])/);
    for (const para of paras) {
      if (start == null) start = page;
      if (buf.length + para.length > MAX_CHUNK && buf.length > 200) { flush(); start = page; }
      buf += (buf ? " " : "") + para;
      while (buf.length > MAX_CHUNK * 1.5) {
        const cut = buf.lastIndexOf(" ", MAX_CHUNK) > 200 ? buf.lastIndexOf(" ", MAX_CHUNK) : MAX_CHUNK;
        const rest = buf.slice(cut);
        buf = buf.slice(0, cut);
        flush();
        start = page;
        buf = rest.trim();
      }
    }
    // Keep chunks from straddling too many pages
    if (buf.length > MAX_CHUNK * 0.7) flush();
  }
  flush();
  return chunks;
}

// Embedding <-> compact int8 base64 (256 dims → 256 bytes)
export function quantize(vec) {
  const n = Math.hypot(...vec) || 1;
  const arr = Int8Array.from(vec, (v) => Math.max(-127, Math.min(127, Math.round((v / n) * 127))));
  return Buffer.from(arr.buffer).toString("base64");
}

export function dequantize(b64) {
  const buf = Buffer.from(b64, "base64");
  return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
}

export function cosine(q, e) {
  let dot = 0, nq = 0, ne = 0;
  for (let i = 0; i < Math.min(q.length, e.length); i++) {
    dot += q[i] * e[i];
    nq += q[i] * q[i];
    ne += e[i] * e[i];
  }
  return nq && ne ? dot / Math.sqrt(nq * ne) : 0;
}

const tokens = (s) => String(s || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

// Simple BM25 keyword score, so search still works without embeddings (or with the free limit used up)
export function keywordScores(query, chunks) {
  const q = [...new Set(tokens(query))];
  if (!q.length) return chunks.map(() => 0);
  const docs = chunks.map((c) => tokens(c.t));
  const avg = docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1);
  const df = Object.fromEntries(q.map((w) => [w, docs.filter((d) => d.includes(w)).length]));
  return docs.map((d) => {
    let s = 0;
    for (const w of q) {
      const tf = d.filter((x) => x === w).length;
      if (!tf) continue;
      const idf = Math.log(1 + (docs.length - df[w] + 0.5) / (df[w] + 0.5));
      s += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / (avg || 1)))));
    }
    return s;
  });
}

// docs: [{ docId, title, subjectId, chunks: [{ p, t, e? }] }]
export function rank(query, docs, qVec, { k = 6, subjectId } = {}) {
  const flat = [];
  for (const d of docs) {
    if (subjectId && d.subjectId && d.subjectId !== subjectId) continue;
    for (const c of d.chunks || []) flat.push({ doc: d, c });
  }
  if (!flat.length) return [];
  const kw = keywordScores(query, flat.map((x) => x.c));
  const kwMax = Math.max(...kw, 1e-9);
  const scored = flat.map((x, i) => {
    const sem = qVec && x.c.e ? cosine(qVec, dequantize(x.c.e)) : 0;
    const score = qVec ? sem * 0.75 + (kw[i] / kwMax) * 0.25 : kw[i] / kwMax;
    return { title: x.doc.title, docId: x.doc.docId, page: x.c.p, text: x.c.t, score: Math.round(score * 1000) / 1000 };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

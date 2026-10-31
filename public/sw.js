// Life Tracker service worker: makes the app open instantly and work offline for what's been loaded.
// API calls always go to the network (your data must stay fresh); the app shell is cached.
const VERSION = "lt-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return; // never cache data or login

  // Built assets are fingerprinted: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.endsWith(".mjs")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Pages: network first, fall back to the cached shell when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put("/", copy));
        return res;
      }).catch(() => caches.match("/"))
    );
  }
});

// Push notifications (morning plan, evening check-in)
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { title: "Life", body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(p.title || "Life", {
      body: p.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: p.tag || "life",
      data: { url: p.url || "/" },
      actions: Array.isArray(p.actions) ? p.actions.slice(0, 2) : [],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Buttons like "On time" / "Late" log straight away without opening the app
  if (e.action) {
    e.waitUntil(
      fetch("/api/jarvis/act", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: e.action }) })
        .then((r) => r.json())
        .then((j) => self.registration.showNotification(j.ok ? "Logged" : "Couldn't log", { body: j.ok ? (j.actions || []).join(", ") : j.error || "Open the app to log it.", icon: "/icons/icon-192.png", tag: "logged" }))
        .catch(() => {})
    );
    return;
  }
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});

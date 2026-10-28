"use client";

import { useEffect, useState } from "react";

// The email link lands here with the login token in the URL hash
export default function AuthCallback() {
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const token = p.get("access_token");
    history.replaceState(null, "", "/auth"); // remove the token from the address bar
    if (!token) {
      setMsg(p.get("error_description")?.replace(/\+/g, " ") || "This login link is invalid or has expired. Request a new one.");
      return;
    }
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) })
      .then(async (r) => {
        if (r.ok) window.location.replace("/");
        else setMsg((await r.json().catch(() => ({}))).error || "Login failed.");
      })
      .catch(() => setMsg("Login failed — check your connection."));
  }, []);
  return (
    <div className="center login">
      <div className="brand big">Life<span>.</span></div>
      <p className="muted">{msg}</p>
      {!msg.startsWith("Signing") && <a className="btn" href="/">Back to login</a>}
    </div>
  );
}

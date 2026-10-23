"use client";

import { useState } from "react";
import { Card, Del, Empty, Header, NoteArea, Seg } from "./ui";
import { uid } from "@/lib/data";

const STATUSES = ["Idea", "Active", "Paused", "Done"];

export default function Projects({ data, update }) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("open");
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    update((d) => { d.projects.unshift({ id: uid(), name: name.trim(), status: "Active", nextStep: "", notes: "" }); });
    setName("");
  };
  const edit = (id, patch) => update((d) => { Object.assign(d.projects.find((p) => p.id === id), patch); });
  const remove = (id) => update((d) => { d.projects = d.projects.filter((p) => p.id !== id); });
  const list = data.projects.filter((p) => filter === "all" || (filter === "open" ? p.status !== "Done" : p.status === "Done"));

  return (
    <>
      <Header
        title="Projects"
        sub="Everything you're building, with the next step for each"
        right={<Seg value={filter} onChange={setFilter} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />}
      />
      <form className="addrow" onSubmit={add}>
        <input placeholder="New project…" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      {list.length === 0 && <Empty>No projects here.</Empty>}
      <div className="grid2">
        {list.map((p) => (
          <Card key={p.id} className={`project st-${p.status.toLowerCase()}`}>
            <div className="row-between">
              <input className="ghost strong big grow" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} />
              <select className="status" value={p.status} onChange={(e) => edit(p.id, { status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <Del onClick={() => remove(p.id)} label="Delete project" />
            </div>
            <label className="field">
              <span className="muted small">Next step</span>
              <input value={p.nextStep} placeholder="The very next concrete action" onChange={(e) => edit(p.id, { nextStep: e.target.value })} />
            </label>
            <NoteArea rows={4} value={p.notes} placeholder="Notes, links, ideas, progress…" onChange={(v) => edit(p.id, { notes: v })} />
          </Card>
        ))}
      </div>
    </>
  );
}

// Every change Jarvis makes is recorded as a list of inverse operations, so it can be undone exactly,
// without disturbing anything that changed afterwards.
//   { op: "pull", key, id }       remove the item with this id from array data[key]
//   { op: "put",  key, item }     put this item back into data[key] (replace same id, or append)
//   { op: "set",  path, value }   set a nested value; value undefined deletes it

export function getPath(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (o[path[i]] == null || typeof o[path[i]] !== "object") o[path[i]] = {};
    o = o[path[i]];
  }
  const last = path[path.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

// Undo op that restores whatever is at `path` right now
export const snapshotOp = (data, path) => ({ op: "set", path, value: clone(getPath(data, path)) });

export function applyUndo(data, ops) {
  // Reverse order, so later changes are rolled back first
  for (const u of [...ops].reverse()) {
    if (u.op === "pull") {
      if (Array.isArray(data[u.key])) data[u.key] = data[u.key].filter((x) => x.id !== u.id);
    } else if (u.op === "put") {
      const arr = Array.isArray(data[u.key]) ? data[u.key] : (data[u.key] = []);
      const i = arr.findIndex((x) => x.id === u.item.id);
      if (i >= 0) arr[i] = clone(u.item);
      else arr.push(clone(u.item));
    } else if (u.op === "set") {
      setPath(data, u.path, clone(u.value));
    }
  }
  return data;
}

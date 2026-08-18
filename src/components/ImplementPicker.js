"use client";

import { useEffect, useState } from "react";

// Version 3's Implement Picker + Add/Edit Implement, combined into one
// overlay. Local-only catalog — AgroAPI has no concept of a swappable
// implement, but its width directly drives the area calculation, so the
// contractor needs to be able to add/edit these without a dev involved.
export default function ImplementPicker({ machineId, currentImplementId, onClose, onAssigned }) {
  const [mode, setMode] = useState("list"); // list | edit
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = new, else the implement being edited
  const [name, setName] = useState("");
  const [widthM, setWidthM] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/implements")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function assign(implementId) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/machines/${machineId}/implement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementId }),
      });
      if (!res.ok) throw new Error();
      onAssigned(await res.json());
      onClose();
    } catch {
      setError("Could not assign this implement.");
      setBusy(false);
    }
  }

  function openNew() {
    setEditing(null);
    setName("");
    setWidthM("");
    setError("");
    setMode("edit");
  }

  function openEdit(impl) {
    setEditing(impl);
    setName(impl.name);
    setWidthM(impl.width_m ?? "");
    setError("");
    setMode("edit");
  }

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ name, widthM });
      const res = editing
        ? await fetch(`/api/implements/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/implements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setCatalog((list) =>
        editing ? list.map((i) => (i.id === saved.id ? saved : i)) : [...list, saved]
      );
      setMode("list");
    } catch {
      setError("Could not save this implement.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/implements/${editing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCatalog((list) => list.filter((i) => i.id !== editing.id));
      setMode("list");
    } catch {
      setError("Could not delete this implement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button
          className="ov-back"
          onClick={() => (mode === "edit" ? setMode("list") : onClose())}
          aria-label="Back"
        >
          ←
        </button>
        <span className="ov-title">
          {mode === "list" ? "Select Implement" : editing ? "Edit Implement" : "Add Implement"}
        </span>
      </div>

      <div className="ov-body">
        {mode === "list" && (
          <>
            {loading && <p className="text-sm text-[var(--text-sec)]">Loading…</p>}
            {!loading && catalog.length === 0 && (
              <p className="empty-msg">No implements yet — add your first one below.</p>
            )}
            <div className="flex flex-col gap-2">
              {catalog.map((impl) => (
                <div
                  key={impl.id}
                  className={`choice-card ${impl.id === currentImplementId ? "selected" : ""}`}
                  style={{ cursor: "default" }}
                >
                  <div className="icon">🔧</div>
                  <button
                    className="txt flex-1 text-left"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => assign(impl.id)}
                    disabled={busy}
                  >
                    <b>{impl.name}</b>
                    <span>{impl.width_m ? `${impl.width_m} m` : "No width set"}</span>
                  </button>
                  <button className="px-2 text-xs font-bold" onClick={() => openEdit(impl)}>
                    Edit
                  </button>
                </div>
              ))}
            </div>
            <button
              className="fieldset-note w-full text-center"
              style={{ border: "1.5px dashed var(--rule)" }}
              onClick={openNew}
            >
              + Add New Implement
            </button>
            {currentImplementId && (
              <button
                className="mt-2 text-xs text-[var(--danger)]"
                onClick={() => assign(null)}
                disabled={busy}
              >
                Unassign current implement
              </button>
            )}
          </>
        )}

        {mode === "edit" && (
          <>
            <div>
              <div className="field-label">Implement name</div>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 6m Disc Harrow"
                autoFocus
              />
            </div>
            <div>
              <div className="field-label">Width (m)</div>
              <input
                className="field"
                type="number"
                step="0.1"
                value={widthM}
                onChange={(e) => setWidthM(e.target.value)}
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>

      <div className="ov-footer">
        {mode === "edit" ? (
          <>
            {editing && (
              <button className="btn btn-outline" onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button className="btn btn-outline w-full" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

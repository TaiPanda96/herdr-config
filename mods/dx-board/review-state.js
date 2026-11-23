// Review state is independent of Herdr's transient done/idle acknowledgement.
export const reviewKey = a => JSON.stringify([a.space, a.tab, a.address]);
export function reconcile(records, live, now) {
  const out = { ...records };
  for (const a of live) {
    const key = reviewKey(a), old = out[key] || {};
    const completed = a.status === "done" && (old.lastStatus !== "done" && old.lastStatus !== "idle" || !old.snapshot || old.seq !== a.seq)
      || old.lastStatus === "working" && a.status === "idle";
    const state = completed ? "pending" : old.state || "observing";
    const snapshot = { address:a.address, space:a.space, tab:a.tab, title:a.title,
      space_name:a.space_name, tab_name:a.tab_name, program:a.program,
      branch:a.branch, folder:a.folder, machine:a.machine || null, seq:a.seq || 0 };
    out[key] = { state, lastStatus:a.status, seq:a.seq || 0, snapshot,
      updated: completed ? now : old.updated || now };
  }
  // Preserve pending work indefinitely; keep only a bounded set of historical observations.
  const historical = Object.entries(out).filter(([,r]) => r.state !== "pending")
    .sort((a,b) => b[1].updated - a[1].updated);
  for (const [key] of historical.slice(300)) delete out[key];
  return out;
}

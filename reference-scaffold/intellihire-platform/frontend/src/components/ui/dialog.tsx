import * as React from "react";

export function Dialog({ open, children }: { open?: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40"><div className="rounded-lg border bg-card p-6 shadow-xl">{children}</div></div>;
}


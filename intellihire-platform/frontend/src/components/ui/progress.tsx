export function Progress({ value = 0 }: { value?: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${value}%` }} /></div>;
}


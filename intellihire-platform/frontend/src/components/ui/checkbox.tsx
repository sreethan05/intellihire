import * as React from "react";

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" {...props} />;
}


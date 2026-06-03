import * as React from "react";

export function Slider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" className="w-full accent-primary" {...props} />;
}


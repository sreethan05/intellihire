import * as React from "react";

export function Table(props: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className="w-full text-sm" {...props} />;
}


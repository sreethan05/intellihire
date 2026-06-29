import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary", className)} {...props} />;
}


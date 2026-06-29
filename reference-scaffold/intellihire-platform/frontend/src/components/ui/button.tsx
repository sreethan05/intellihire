import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  asChild?: boolean;
};

export function Button({ className, variant = "default", asChild: _asChild, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:opacity-50",
        variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "outline" && "border border-border bg-transparent hover:bg-muted",
        variant === "ghost" && "hover:bg-muted",
        variant === "destructive" && "bg-red-600 text-white hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}

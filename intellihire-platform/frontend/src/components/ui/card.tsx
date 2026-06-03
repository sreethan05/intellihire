import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />
));
Card.displayName = "Card";
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) { return <div className="p-5 pb-2" {...props} />; }
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) { return <h2 className="text-lg font-semibold" {...props} />; }
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) { return <div className="p-5" {...props} />; }

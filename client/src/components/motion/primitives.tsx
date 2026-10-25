import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

/**
 * Shared motion design primitives for the IntelliHire UI refresh.
 * Reference aesthetic: warm off-white canvas, dark navy hero, sage/orange
 * accents, glass cards, count-up stats, staggered entrances, hover lifts.
 * All primitives respect prefers-reduced-motion.
 */

/** Count-up number that animates from 0 to `value` when scrolled into view. */
export function AnimatedNumber({
  value,
  className,
  duration = 1.1,
}: {
  value: string | number;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const numeric = typeof value === "number" || /^\d+(\.\d+)?%?$/.test(String(value));
  const target = numeric ? parseFloat(String(value)) : NaN;
  const suffix = typeof value === "string" && value.endsWith("%") ? "%" : "";
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || Number.isNaN(target)) return;
    if (reduce) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // easeOutExpo for a snappy settle
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, reduce]);

  if (Number.isNaN(target)) return <span className={className}>{value}</span>;
  const isFloat = String(value).includes(".");
  const shown = isFloat ? display.toFixed(1) : Math.round(display).toLocaleString();
  return (
    <span ref={ref} className={className}>
      {shown}{suffix}
    </span>
  );
}

/** Glass card with an optional hover lift (y: -5 + shadow grow). */
export function GlassCard({
  children,
  className = "",
  hoverLift = true,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  hoverLift?: boolean;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      whileHover={hoverLift && !reduce ? { y: -5, boxShadow: "0 18px 40px -18px rgba(30, 41, 59, 0.25)" } : undefined}
      className={`rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_2px_20px_-8px_rgba(30,41,59,0.12)] backdrop-blur-md ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Pulsing "live" indicator dot + label, sage-green by default. */
export function LiveBadge({
  label = "Live",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
      </span>
      {label}
    </span>
  );
}

/** Gradient accent text (sage → teal → amber), theme-aware for contrast. */
export function GradientText({ children }: { children: ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-amber-500 bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-amber-300">
      {children}
    </span>
  );
}

/** Staggered entrance container for grids/lists. */
export function Stagger({
  children,
  className = "",
  gap = 0.07,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Child of Stagger — fades up into place. */
export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={
        reduce
          ? undefined
          : {
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] } },
            }
      }
    >
      {children}
    </motion.div>
  );
}

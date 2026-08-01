import { useTheme } from "next-themes";
import { Sun, Moon, Laptop } from "lucide-react";
import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setTheme("light")}
        title="Light Mode"
        className={`rounded-full p-1.5 text-xs transition ${
          theme === "light"
            ? "bg-white text-amber-500 shadow-sm dark:bg-slate-800"
            : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        title="Dark Mode"
        className={`rounded-full p-1.5 text-xs transition ${
          theme === "dark"
            ? "bg-slate-800 text-blue-400 shadow-sm"
            : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        title="System Theme"
        className={`rounded-full p-1.5 text-xs transition ${
          theme === "system"
            ? "bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-200"
            : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
        }`}
      >
        <Laptop className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

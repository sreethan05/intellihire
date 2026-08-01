import { useState } from "react";
import { AlertTriangle, CheckCircle, ShieldAlert, Code2 } from "lucide-react";

export interface PlagiarismMatch {
  candidateA: { id: string; name: string; rollNumber: string };
  candidateB: { id: string; name: string; rollNumber: string };
  similarity: number; // 0 to 100
  matchedTokensCount: number;
  codeA: string;
  codeB: string;
}

export default function PlagiarismHeatmap({
  candidateA,
  candidateB,
  similarity,
  matchedTokensCount,
  codeA,
  codeB,
}: PlagiarismMatch) {
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const linesA = codeA.split("\n");
  const linesB = codeB.split("\n");

  const getRiskBadge = (score: number) => {
    if (score >= 70) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/30">
          <ShieldAlert className="h-3.5 w-3.5" /> High Similarity ({score}%)
        </span>
      );
    }
    if (score >= 40) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30">
          <AlertTriangle className="h-3.5 w-3.5" /> Moderate Match ({score}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30">
        <CheckCircle className="h-3.5 w-3.5" /> Low Similarity ({score}%)
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Code2 className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
            Code AST Plagiarism Heatmap
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Token-level structural similarity comparison across candidate submissions
          </p>
        </div>
        <div>{getRiskBadge(similarity)}</div>
      </div>

      {/* Similarity Progress Bar */}
      <div className="my-4 space-y-1.5">
        <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
          <span>Overall Similarity Score</span>
          <span>{similarity}% match ({matchedTokensCount} shared AST tokens)</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full transition-all duration-500 ${
              similarity >= 70
                ? "bg-rose-500"
                : similarity >= 40
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${similarity}%` }}
          />
        </div>
      </div>

      {/* Side-by-Side Code Diff Viewer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {/* Candidate A Column */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 font-mono text-xs overflow-x-auto text-slate-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs font-sans font-bold">
            <span className="text-violet-400">{candidateA.name} ({candidateA.rollNumber})</span>
            <span className="text-slate-500">Submission A</span>
          </div>
          <div className="space-y-1">
            {linesA.map((line, idx) => {
              const isSimilar = line.trim().length > 4 && linesB.some((l) => l.trim() === line.trim());
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedLine(idx)}
                  className={`flex gap-3 px-2 py-0.5 rounded cursor-pointer transition ${
                    isSimilar
                      ? "bg-rose-950/80 text-rose-300 border-l-2 border-rose-500 font-semibold"
                      : "hover:bg-slate-900 text-slate-300"
                  } ${selectedLine === idx ? "ring-1 ring-violet-500" : ""}`}
                >
                  <span className="w-6 shrink-0 text-right text-slate-600 select-none">{idx + 1}</span>
                  <pre className="truncate">{line || " "}</pre>
                </div>
              );
            })}
          </div>
        </div>

        {/* Candidate B Column */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 font-mono text-xs overflow-x-auto text-slate-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs font-sans font-bold">
            <span className="text-indigo-400">{candidateB.name} ({candidateB.rollNumber})</span>
            <span className="text-slate-500">Submission B</span>
          </div>
          <div className="space-y-1">
            {linesB.map((line, idx) => {
              const isSimilar = line.trim().length > 4 && linesA.some((l) => l.trim() === line.trim());
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedLine(idx)}
                  className={`flex gap-3 px-2 py-0.5 rounded cursor-pointer transition ${
                    isSimilar
                      ? "bg-rose-950/80 text-rose-300 border-l-2 border-rose-500 font-semibold"
                      : "hover:bg-slate-900 text-slate-300"
                  } ${selectedLine === idx ? "ring-1 ring-indigo-500" : ""}`}
                >
                  <span className="w-6 shrink-0 text-right text-slate-600 select-none">{idx + 1}</span>
                  <pre className="truncate">{line || " "}</pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

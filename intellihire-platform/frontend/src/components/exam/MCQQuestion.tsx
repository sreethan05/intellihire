import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function MCQQuestion({ question, selected, onSelect, onClear, onFlag }: { question: any; selected?: number; onSelect: (i: number) => void; onClear: () => void; onFlag: () => void }) {
  const options = Array.isArray(question.options) ? question.options : Object.values(question.options ?? {});
  return (
    <div className="space-y-4">
      <div className="prose max-w-none dark:prose-invert">
        <ReactMarkdown>{question.question_text}</ReactMarkdown>
      </div>
      <div className="grid gap-3">
        {options.map((option: any, index: number) => (
          <Card key={index} onClick={() => onSelect(index)} className={`cursor-pointer p-4 ${selected === index ? "border-primary ring-2 ring-primary" : ""}`}>{String(option)}</Card>
        ))}
      </div>
      <div className="flex gap-2"><Button variant="outline" onClick={onFlag}>Flag</Button><Button variant="ghost" onClick={onClear}>Clear</Button></div>
    </div>
  );
}

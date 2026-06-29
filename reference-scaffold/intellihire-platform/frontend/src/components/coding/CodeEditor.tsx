import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";

export default function CodeEditor({ language, code, onLanguage, onCode }: { language: string; code: string; onLanguage: (v: string) => void; onCode: (v: string) => void }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-2">
        <select className="rounded-md border bg-background p-2" value={language} onChange={(e) => onLanguage(e.target.value)}>
          <option value="python3">Python 3</option><option value="java">Java</option><option value="cpp">C++</option><option value="javascript">JavaScript</option><option value="c">C</option>
        </select>
        <Button variant="outline">Dark</Button>
      </div>
      <Editor height="100%" language={language === "python3" ? "python" : language} value={code} onChange={(value) => onCode(value ?? "")} options={{ fontSize: 14, minimap: { enabled: false } }} />
    </div>
  );
}


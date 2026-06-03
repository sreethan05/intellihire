import { UploadCloud } from "lucide-react";
import { Input } from "./input";

export function FileUpload({ accept, onFile }: { accept?: string; onFile: (file: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
      <UploadCloud className="h-6 w-6" />
      Drop a file or click to browse
      <Input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}


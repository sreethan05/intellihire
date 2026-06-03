import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProctoringOverlay from "./ProctoringOverlay";
import { useProctoring } from "@/hooks/useProctoring";

export default function PreExamCheck({ onStart }: { onStart: () => void }) {
  const proctoring = useProctoring();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader><CardTitle>Pre-exam Check</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Keep webcam on, stay fullscreen, avoid tab switches, and do not copy or paste during the exam.</p>
          <Button onClick={proctoring.start}><Camera className="h-4 w-4" /> Test webcam and fullscreen</Button>
          <Button onClick={onStart}>I understand, Start Exam</Button>
        </CardContent>
      </Card>
      <ProctoringOverlay {...proctoring} />
    </main>
  );
}


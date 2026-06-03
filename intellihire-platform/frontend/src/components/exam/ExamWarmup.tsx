import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PreExamCheck from "@/components/proctoring/PreExamCheck";

export default function ExamWarmup({ onStart }: { onStart: () => void }) {
  return (
    <PreExamCheck onStart={onStart} />
  );
}


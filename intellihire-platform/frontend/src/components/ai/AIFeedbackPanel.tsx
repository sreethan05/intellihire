import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AIFeedbackPanel({ sections }: { sections: Record<string, string> }) {
  const keys = Object.keys(sections);
  const [active, setActive] = useState(keys[0]);
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">{keys.map((key) => <Button key={key} variant={active === key ? "default" : "outline"} onClick={() => setActive(key)}>{key}</Button>)}</div>
        <p className="whitespace-pre-wrap text-sm">{sections[active]}</p>
      </CardContent>
    </Card>
  );
}


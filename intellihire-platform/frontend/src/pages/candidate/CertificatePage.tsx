import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function CertificatePage() {
  const ref = useRef<HTMLDivElement>(null);
  async function download() {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current);
    const pdf = new jsPDF("landscape");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, 277, 180);
    pdf.save("intellihire-certificate.pdf");
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <Card ref={ref} className="aspect-[1.414] border-4 p-10 text-center">
        <CardContent className="grid h-full place-items-center"><div><h1 className="text-4xl font-bold">Certificate of Placement</h1><p className="mt-8 text-xl">Awarded by IntelliHire</p><p className="mt-4">QR verification placeholder</p></div></CardContent>
      </Card>
      <Button onClick={download}>Download Certificate</Button>
    </main>
  );
}


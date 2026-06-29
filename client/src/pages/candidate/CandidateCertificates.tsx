import { useEffect, useState } from "react";
import { Award, BadgeCheck, Download } from "lucide-react";
import { assetApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CandidateCertificates() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);

  useEffect(() => {
    assetApi.getCertificates().then(({ data }) => setCertificates(data.certificates || []));
    assetApi.getBadges().then(({ data }) => setBadges(data.badges || []));
  }, []);

  const printCertificate = (certificate: any) => {
    const examTitle = certificate.exam?.title || "Assessment";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>${examTitle} Certificate</title></head>
      <body style="font-family:Arial,sans-serif;padding:60px;text-align:center">
        <div style="border:6px solid #1d4ed8;padding:56px">
          <h1 style="font-size:42px;margin:0;color:#0f172a">Certificate of Achievement</h1>
          <p style="font-size:18px;color:#475569;margin-top:24px">Awarded for successfully completing</p>
          <h2 style="font-size:32px;color:#1d4ed8">${examTitle}</h2>
          <p style="color:#64748b">Issued on ${new Date(certificate.issued_at).toLocaleDateString()}</p>
          <h3 style="margin-top:48px;color:#0f172a">IntelliHire</h3>
        </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">Certificates & Badges</h2>
        <p className="mt-1 text-sm text-slate-500">Your earned placement credentials and achievement badges.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-blue-600" />
              Certificates
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {certificates.map((certificate) => (
              <div key={certificate.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div>
                  <div className="font-bold text-slate-900">{certificate.exam?.title || "Assessment Certificate"}</div>
                  <div className="mt-1 text-xs text-slate-500">Issued {new Date(certificate.issued_at).toLocaleDateString()}</div>
                </div>
                <Button variant="outline" onClick={() => printCertificate(certificate)}>
                  <Download className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
            ))}
            {certificates.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">Pass an assessment to unlock certificates.</div>}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-4 w-4 text-blue-600" />
              Badges
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {badges.map((badge) => (
              <div key={badge.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="font-bold text-slate-900">{badge.name}</div>
                <p className="mt-1 text-sm text-slate-600">{badge.description}</p>
              </div>
            ))}
            {badges.length === 0 && <div className="rounded-lg border border-dashed p-6 text-sm text-slate-500">No badges earned yet.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

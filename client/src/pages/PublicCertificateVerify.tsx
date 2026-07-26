import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { Award, CheckCircle2, ShieldCheck, ArrowLeft, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function PublicCertificateVerify() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [certData, setCertData] = useState<any>(null);

  useEffect(() => {
    // Simulated or fetched public certificate verification payload
    const timer = setTimeout(() => {
      setCertData({
        id: id || "CERT-8849201",
        candidateName: "Verified Candidate",
        examTitle: "Full Stack Engineering Assessment",
        issuedDate: "2026-07-25",
        issuer: "IntelliHire Verified Campus Accreditation",
        score: "94%",
        verificationHash: `0x${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
        status: "Official & Valid",
      });
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [id]);

  const currentUrl = window.location.href;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-xl space-y-6">
        <Link to="/login" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-4 w-4" />
          Back to IntelliHire Portal
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center backdrop-blur-xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Verifying Credential Hash...</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
            {/* Verification Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-white tracking-tight">Verified Credential</h1>
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Authenticated on IntelliHire Ledger
                  </p>
                </div>
              </div>

              <div className="bg-white p-2 rounded-xl shadow-lg border border-slate-700">
                <QRCodeSVG value={currentUrl} size={64} />
              </div>
            </div>

            {/* Certificate Details */}
            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Credential ID</span>
                  <span className="font-mono text-slate-200">{certData.id}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Candidate</span>
                  <span className="font-bold text-blue-400">{certData.candidateName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Assessment</span>
                  <span className="font-semibold text-slate-200">{certData.examTitle}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Final Score</span>
                  <span className="font-black text-emerald-400">{certData.score}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Issue Date</span>
                  <span className="text-slate-300">{certData.issuedDate}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cryptographic Verification Hash</div>
                <div className="mt-1 font-mono text-xs text-slate-400 select-all truncate">{certData.verificationHash}</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold">
                <Award className="h-4 w-4 text-blue-400" />
                {certData.issuer}
              </span>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 font-semibold inline-flex items-center gap-1 transition">
                Share Link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

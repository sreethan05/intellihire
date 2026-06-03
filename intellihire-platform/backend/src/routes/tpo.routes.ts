import { parse } from "csv-parse/sync";
import { Router } from "express";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { sendNotifications } from "../services/notification.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pagination } from "../utils/pagination.js";

const router = Router();
router.use(requireAuth, requireRole("tpo"));

router.post("/upload-students", upload.single("file"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ message: "File is required" });
  const { data: tpo, error: tpoError } = await supabaseAdmin.from("tpos").select("college_id,colleges(code)").eq("id", req.user!.id).single();
  if (tpoError) throw tpoError;
  if (!tpo) return res.status(404).json({ message: "TPO profile not found" });
  const buffer = req.file.buffer;
  const rows = req.file.originalname.match(/\.csv$/i)
    ? parse(buffer.toString("utf8"), { columns: true, skip_empty_lines: true })
    : XLSX.utils.sheet_to_json(XLSX.read(buffer).Sheets[XLSX.read(buffer).SheetNames[0]]);
  const uploadRow = await supabaseAdmin.from("tpo_uploads").insert({ tpo_id: req.user!.id, college_id: tpo.college_id, status: "processing", total_records: rows.length }).select().single();
  const failed: Array<Record<string, unknown>> = [];
  const createdIds: string[] = [];
  for (const row of rows as any[]) {
    try {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) throw new Error("Invalid email");
      const cgpa = Number(row.cgpa);
      if (cgpa < 0 || cgpa > 10) throw new Error("Invalid CGPA");
      const password = `${row.roll_number}${(tpo.colleges as any)?.code ?? ""}`;
      const auth = await supabaseAdmin.auth.admin.createUser({ email: row.email, password, email_confirm: true });
      if (auth.error) throw auth.error;
      await supabaseAdmin.from("users").insert({ id: auth.data.user.id, email: row.email, role: "candidate", must_change_password: true });
      await supabaseAdmin.from("candidates").insert({ id: auth.data.user.id, college_id: tpo.college_id, roll_number: row.roll_number, full_name: row.full_name, branch: row.branch, cgpa, graduation_year: Number(row.graduation_year), phone: row.phone ?? null });
      createdIds.push(auth.data.user.id);
    } catch (error) {
      failed.push({ row, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  await supabaseAdmin.from("tpo_uploads").update({ status: failed.length ? "failed" : "completed", processed_records: rows.length - failed.length, error_log: failed }).eq("id", uploadRow.data.id);
  await sendNotifications(createdIds, "Welcome to IntelliHire", "Your candidate account has been created. Please complete onboarding.", "info");
  res.json({ total: rows.length, successful: createdIds.length, failed: failed.length, errors: failed });
}));

router.get("/students", asyncHandler(async (req: AuthedRequest, res) => {
  const { data: tpo, error: tpoError } = await supabaseAdmin.from("tpos").select("college_id").eq("id", req.user!.id).single();
  if (tpoError) throw tpoError;
  if (!tpo) return res.status(404).json({ message: "TPO profile not found" });
  const { from, to } = pagination(req.query);
  let query = supabaseAdmin.from("candidates").select("*", { count: "exact" }).eq("college_id", tpo.college_id).range(from, to);
  if (req.query.branch) query = query.eq("branch", req.query.branch);
  if (req.query.graduation_year) query = query.eq("graduation_year", Number(req.query.graduation_year));
  if (req.query.cgpa_min) query = query.gte("cgpa", Number(req.query.cgpa_min));
  if (req.query.cgpa_max) query = query.lte("cgpa", Number(req.query.cgpa_max));
  if (req.query.search) query = query.or(`full_name.ilike.%${req.query.search}%,roll_number.ilike.%${req.query.search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  res.json({ data, count });
}));

router.get("/upload-history", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("tpo_uploads").select("*").eq("tpo_id", req.user!.id).order("uploaded_at", { ascending: false });
  if (error) throw error;
  res.json(data);
}));

export default router;

import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { sendNotifications } from "../services/notification.service.js";
import type { AuthedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pagination } from "../utils/pagination.js";

const router = Router();
router.use(requireAuth);

router.post("/send", asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_id];
  res.status(201).json(await sendNotifications(ids, req.body.title, req.body.message, req.body.type));
}));

router.get("/", asyncHandler(async (req: AuthedRequest, res) => {
  const { from, to } = pagination(req.query);
  const { data, count, error } = await supabaseAdmin.from("notifications").select("*", { count: "exact" }).eq("user_id", req.user!.id).order("read", { ascending: true }).order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  res.json({ data, count });
}));

router.put("/:id/read", asyncHandler(async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin.from("notifications").update({ read: true }).eq("id", req.params.id).eq("user_id", req.user!.id).select().single();
  if (error) throw error;
  res.json(data);
}));

router.put("/read-all", asyncHandler(async (req: AuthedRequest, res) => {
  const { error } = await supabaseAdmin.from("notifications").update({ read: true }).eq("user_id", req.user!.id);
  if (error) throw error;
  res.json({ ok: true });
}));

export default router;


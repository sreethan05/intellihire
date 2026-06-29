import { supabaseAdmin } from "../lib/supabase.js";

export async function sendNotifications(userIds: string[], title: string, message: string, type = "info") {
  if (!userIds.length) return [];
  const rows = userIds.map((user_id) => ({ user_id, title, message, type }));
  const { data, error } = await supabaseAdmin.from("notifications").insert(rows).select();
  if (error) throw error;
  return data;
}


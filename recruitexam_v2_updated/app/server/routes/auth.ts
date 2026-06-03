import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { generateToken } from "../middleware/auth";
import { isValidEmail } from "../lib/validation";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = String(email || "").trim();
    if (!identifier || !password) {
      res.status(400).json({ error: "Username/email and password required" });
      return;
    }
    if (identifier.includes("@") && !isValidEmail(identifier)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }

    let { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", identifier)
      .limit(1);

    if ((!users || users.length === 0) && !error) {
      const rollLookup = await supabase
        .from("users")
        .select("*")
        .eq("roll_number", identifier)
        .limit(1);
      users = rollLookup.data;
      error = rollLookup.error;
    }

    if (error || !users || users.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roll_number: user.roll_number,
        college_id: user.college_id,
        profile_complete: user.profile_complete,
        must_change_password: user.must_change_password,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

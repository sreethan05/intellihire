import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../lib/postgres.js";
import { generateToken, authMiddleware, refreshToken, type AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { isValidEmail } from "../lib/validation.js";
import { loginSchema } from "../lib/schemas.js";
import { logger } from "../lib/logger.js";

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authenticate a user and get a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many login attempts (rate limited)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

const router = Router();

router.post("/login", validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email.trim();

    // Check if it is a roll number (alphanumeric, 5-20 characters)
    const isRollNumber = /^[a-zA-Z0-9]{5,20}$/.test(identifier);

    // Validate identifier format
    if (!isRollNumber && !isValidEmail(identifier)) {
      res.status(400).json({ error: "Enter a valid email address or roll number" });
      return;
    }

    // Lookup by email first, then by roll number
    let { data: users, error } = await db
      .from("users")
      .select("*")
      .eq("email", identifier)
      .limit(1);

    if ((!users || users.length === 0) && !error) {
      const rollLookup = await db
        .from("users")
        .select("*")
        .eq("roll_number", identifier)
        .limit(1);
      users = rollLookup.data;
      error = rollLookup.error;
    }

    if (error || !users || users.length === 0) {
      // Generic message to avoid user enumeration
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

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh an expiring JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New token issued
 *       401:
 *         description: Invalid or expired token
 */
router.post("/refresh", authMiddleware, (req: AuthRequest, res) => {
  const getCookie = (cookieHeader: string | undefined, name: string): string | null => {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  };

  let currentToken: string | null = getCookie(req.headers.cookie, "token");
  if (!currentToken) {
    const authHeader = req.headers.authorization;
    currentToken = authHeader?.split(" ")[1] || null;
  }

  if (!currentToken) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const newToken = refreshToken(currentToken);
  if (!newToken) {
    res.status(401).json({ error: "Token could not be refreshed" });
    return;
  }

  res.cookie("token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({ token: newToken });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  res.json({ success: true });
});

export default router;

import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, pool, transaction } from "../lib/postgres.js";
import {
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
  generateRefreshToken,
  generateToken,
  getCookie,
  hashRefreshToken,
  setSessionCookies,
  authMiddleware,
  type AuthRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { isValidEmail } from "../lib/validation.js";
import { loginSchema } from "../lib/schemas.js";
import { logger } from "../lib/logger.js";
import { redisClient } from "../lib/cache.js";

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

const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCK_SECONDS = 15 * 60;

type DbUser = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  roll_number?: string | null;
  college_id?: string | null;
  profile_complete?: boolean | null;
  must_change_password?: boolean | null;
};

type PublicUser = Omit<DbUser, "password_hash">;

const publicUser = (user: DbUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  roll_number: user.roll_number,
  college_id: user.college_id,
  profile_complete: user.profile_complete,
  must_change_password: user.must_change_password,
});

const normalizeIdentifier = (identifier: string) => identifier.trim().toLowerCase();
const failedLoginKey = (identifier: string) => `auth:failed-login:${identifier}`;
const loginLockKey = (identifier: string) => `auth:login-lock:${identifier}`;
const memoryLoginState = new Map<string, { failures: number; resetAt: number; lockedUntil?: number }>();

async function getLoginLockSeconds(identifier: string) {
  if (redisClient) {
    try {
      const ttl = await redisClient.ttl(loginLockKey(identifier));
      return ttl > 0 ? ttl : 0;
    } catch (err) {
      logger.warn({ err }, "Login lock Redis lookup failed");
    }
  }

  const state = memoryLoginState.get(identifier);
  if (!state?.lockedUntil) return 0;
  const remainingMs = state.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    memoryLoginState.delete(identifier);
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

async function recordFailedLogin(identifier: string) {
  if (redisClient) {
    try {
      const failures = await redisClient.incr(failedLoginKey(identifier));
      if (failures === 1) {
        await redisClient.expire(failedLoginKey(identifier), FAILED_LOGIN_WINDOW_SECONDS);
      }
      if (failures >= FAILED_LOGIN_LIMIT) {
        await redisClient.setex(loginLockKey(identifier), LOGIN_LOCK_SECONDS, "1");
        await redisClient.del(failedLoginKey(identifier));
      }
      return;
    } catch (err) {
      logger.warn({ err }, "Login failure Redis update failed");
    }
  }

  const now = Date.now();
  const existing = memoryLoginState.get(identifier);
  const state = existing && existing.resetAt > now
    ? existing
    : { failures: 0, resetAt: now + FAILED_LOGIN_WINDOW_SECONDS * 1000 };
  state.failures += 1;
  if (state.failures >= FAILED_LOGIN_LIMIT) {
    state.lockedUntil = now + LOGIN_LOCK_SECONDS * 1000;
  }
  memoryLoginState.set(identifier, state);
}

async function clearFailedLogins(identifier: string) {
  if (redisClient) {
    try {
      await redisClient.del(failedLoginKey(identifier), loginLockKey(identifier));
      return;
    } catch (err) {
      logger.warn({ err }, "Login failure Redis cleanup failed");
    }
  }
  memoryLoginState.delete(identifier);
}

async function createRefreshSession(userId: string, req: AuthRequest) {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_by_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, req.ip || null, req.get("user-agent") || null]
  );
  return refreshToken;
}

async function rotateRefreshSession(currentRefreshToken: string, req: AuthRequest) {
  const currentHash = hashRefreshToken(currentRefreshToken);
  const nextRefreshToken = generateRefreshToken();
  const nextHash = hashRefreshToken(nextRefreshToken);
  const nextExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT
         rt.id AS refresh_token_id,
         rt.user_id AS user_id,
         rt.expires_at AS refresh_expires_at,
         rt.revoked_at AS refresh_revoked_at,
         u.id AS id,
         u.name AS name,
         u.email AS email,
         u.role AS role,
         u.roll_number AS roll_number,
         u.college_id AS college_id,
         u.profile_complete AS profile_complete,
         u.must_change_password AS must_change_password,
         u.password_hash AS password_hash
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE`,
      [currentHash]
    );

    const row = rows[0] as (DbUser & {
      refresh_token_id: string;
      user_id: string;
      refresh_expires_at: string;
      refresh_revoked_at: string | null;
    }) | undefined;

    if (!row) return null;

    if (row.refresh_revoked_at) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id]
      );
      return null;
    }

    if (new Date(row.refresh_expires_at).getTime() <= Date.now()) {
      await client.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [row.refresh_token_id]);
      return null;
    }

    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), last_used_at = NOW(), replaced_by_token_hash = $1
       WHERE id = $2`,
      [nextHash, row.refresh_token_id]
    );
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_by_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.user_id, nextHash, nextExpiresAt, req.ip || null, req.get("user-agent") || null]
    );

    return {
      refreshToken: nextRefreshToken,
      user: publicUser(row),
    };
  });
}

async function revokeRefreshToken(refreshToken: string | null) {
  if (!refreshToken) return;
  try {
    await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL", [
      hashRefreshToken(refreshToken),
    ]);
  } catch (err) {
    logger.warn({ err }, "Refresh token revoke failed");
  }
}

router.post("/login", validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email.trim();
    const normalizedIdentifier = normalizeIdentifier(identifier);

    // Check if it is a roll number (alphanumeric, 5-20 characters)
    const isRollNumber = /^[a-zA-Z0-9]{5,20}$/.test(identifier);

    // Validate identifier format
    if (!isRollNumber && !isValidEmail(identifier)) {
      res.status(400).json({ error: "Enter a valid email address or roll number" });
      return;
    }

    const lockSeconds = await getLoginLockSeconds(normalizedIdentifier);
    if (lockSeconds > 0) {
      res.status(429).json({
        error: "Too many failed login attempts. Please try again later.",
        retry_after_seconds: lockSeconds,
      });
      return;
    }

    const lookupIdentifier = isRollNumber ? identifier : normalizedIdentifier;

    // Lookup by email first, then by roll number
    let { data: users, error } = await db
      .from("users")
      .select("*")
      .eq("email", lookupIdentifier)
      .limit(1);

    if ((!users || users.length === 0) && !error) {
      const rollLookup = await db
        .from("users")
        .select("*")
        .eq("roll_number", lookupIdentifier)
        .limit(1);
      users = rollLookup.data;
      error = rollLookup.error;
    }

    if (error || !users || users.length === 0) {
      await recordFailedLogin(normalizedIdentifier);
      // Generic message to avoid user enumeration
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = users[0] as DbUser;
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailedLogin(normalizedIdentifier);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await clearFailedLogins(normalizedIdentifier);

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await createRefreshSession(user.id, req);
    const csrfToken = setSessionCookies(res, token, refreshToken);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      csrfToken,
      user: publicUser(user),
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
router.post("/refresh", async (req: AuthRequest, res) => {
  const currentRefreshToken = getCookie(req.headers.cookie, REFRESH_TOKEN_COOKIE);
  if (!currentRefreshToken) {
    clearSessionCookies(res);
    res.status(401).json({ error: "No refresh token provided" });
    return;
  }

  const rotated = await rotateRefreshSession(currentRefreshToken, req);
  if (!rotated) {
    clearSessionCookies(res);
    res.status(401).json({ error: "Session could not be refreshed" });
    return;
  }

  const accessToken = generateToken({
    id: rotated.user.id,
    email: rotated.user.email,
    role: rotated.user.role,
  });
  const csrfToken = setSessionCookies(res, accessToken, rotated.refreshToken);

  res.setHeader("Cache-Control", "no-store");
  res.json({ csrfToken, user: rotated.user });
});

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  const { data: user, error } = await db
    .from("users")
    .select("id, name, email, role, roll_number, college_id, profile_complete, must_change_password")
    .eq("id", req.user!.id)
    .single();

  if (error || !user) {
    res.status(401).json({ error: "Session user not found" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({ user });
});

router.post("/logout", async (req, res) => {
  await revokeRefreshToken(getCookie(req.headers.cookie, REFRESH_TOKEN_COOKIE));
  clearSessionCookies(res);
  res.json({ success: true });
});

export default router;

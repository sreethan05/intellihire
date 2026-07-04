import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

const isTest = config.NODE_ENV === "test";

export let redisClient: Redis | null = null;
let isConnected = false;

if (!isTest) {
  try {
    redisClient = new Redis(config.REDIS_URL || "redis://localhost:6379", {
      enableOfflineQueue: false,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 500, 2000);
      },
    });

    redisClient.on("connect", () => {
      isConnected = true;
      logger.info("Redis cache client connected successfully");
    });

    // Prevent the ioredis "error" event from becoming an unhandled error
    // that crashes the process when Redis is unavailable.
    redisClient.on("error", (err) => {
      isConnected = false;
      logger.warn({ err: err.message }, "Redis cache client connection error");
    });
    // Same for the close event — just log, don't throw.
    redisClient.on("close", () => {
      isConnected = false;
      logger.warn("Redis cache client connection closed");
    });
  } catch (err: any) {
    logger.warn({ err: err.message }, "Failed to initialize Redis client");
  }
}

export async function get<T>(key: string): Promise<T | null> {
  if (!redisClient || !isConnected) return null;
  try {
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err: any) {
    logger.error({ err: err.message, key }, "Redis get error");
    return null;
  }
}

export async function set(key: string, value: any, ttlSeconds = 300): Promise<void> {
  if (!redisClient || !isConnected) return;
  try {
    const data = JSON.stringify(value);
    await redisClient.setex(key, ttlSeconds, data);
  } catch (err: any) {
    logger.error({ err: err.message, key }, "Redis set error");
  }
}

export async function del(key: string): Promise<void> {
  if (!redisClient || !isConnected) return;
  try {
    await redisClient.del(key);
  } catch (err: any) {
    logger.error({ err: err.message, key }, "Redis del error");
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  if (!redisClient || !isConnected) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info({ pattern, count: keys.length }, "Redis invalidated keys matching pattern");
    }
  } catch (err: any) {
    logger.error({ err: err.message, pattern }, "Redis pattern invalidation error");
  }
}

export function cacheMiddleware(ttlSeconds = 300) {
  return async (req: any, res: any, next: any) => {
    if (!redisClient || !isConnected || req.method !== "GET") {
      return next();
    }
    const key = `cache:api:${req.originalUrl || req.url}`;
    try {
      const cachedData = await get(key);
      if (cachedData) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cachedData);
      }
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        set(key, body, ttlSeconds).catch((err) => {
          logger.error({ err }, "Failed to write response to cache");
        });
        res.setHeader("X-Cache", "MISS");
        return originalJson(body);
      };
      next();
    } catch (err) {
      logger.error({ err }, "cacheMiddleware error");
      next();
    }
  };
}

export function isCacheActive(): boolean {
  return isConnected;
}

export const cache = {
  get,
  set,
  del,
  invalidatePattern,
  isCacheActive,
  cacheMiddleware,
};

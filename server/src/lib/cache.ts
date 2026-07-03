import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

const isTest = config.NODE_ENV === "test";

let redisClient: Redis | null = null;
let isConnected = false;

if (!isTest) {
  try {
    redisClient = new Redis(config.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redisClient.on("connect", () => {
      isConnected = true;
      logger.info("Redis cache client connected successfully");
    });

    redisClient.on("error", (err) => {
      isConnected = false;
      logger.warn({ err: err.message }, "Redis cache client connection error");
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

export function isCacheActive(): boolean {
  return isConnected;
}

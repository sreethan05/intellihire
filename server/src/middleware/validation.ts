import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      res.status(400).json({
        error: firstError.message,
        field: firstError.path.join("."),
      });
      return;
    }
    // Override req.body with typed, validated data
    req.body = result.data;
    next();
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const firstError = result.error.issues[0];
      res.status(400).json({
        error: firstError.message,
        field: firstError.path.join("."),
      });
      return;
    }
    req.query = result.data as any;
    next();
  };
};

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const firstError = result.error.issues[0];
      res.status(400).json({
        error: firstError.message,
        field: firstError.path.join("."),
      });
      return;
    }
    req.params = result.data as any;
    next();
  };
};

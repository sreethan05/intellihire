import type { NextFunction, Request, Response } from "express";

export const asyncHandler =
  (fn: (req: Request | any, res: Response, next: NextFunction) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

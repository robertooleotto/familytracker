/**
 * Reusable Express middleware for validating request bodies, params and
 * query strings with Zod. Use this everywhere instead of hand-rolling
 * validation in each route.
 *
 * Example:
 *
 *   import { z } from "zod";
 *   import { validateBody } from "../lib/validate";
 *
 *   const createExpenseSchema = z.object({
 *     amount: z.number().positive(),
 *     category: z.string().min(1).max(50),
 *     note: z.string().max(500).optional(),
 *   });
 *
 *   app.post("/api/expenses",
 *     auth,
 *     validateBody(createExpenseSchema),
 *     async (req, res) => {
 *       // req.validated.body is fully typed as z.infer<typeof createExpenseSchema>
 *       const { amount, category, note } = req.validated.body;
 *       ...
 *     }
 *   );
 */
import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema, type z } from "zod";

// Augment Express's Request type so handlers can access typed validated input.
declare module "express-serve-static-core" {
  interface Request {
    validated: {
      body?: unknown;
      params?: unknown;
      query?: unknown;
    };
  }
}

/**
 * Convert a ZodError into a flat list of `{ path, message }` objects so the
 * client can render field-level errors. We deliberately do NOT include the
 * raw input or stack traces.
 */
function formatZodError(err: ZodError) {
  return err.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function ensureValidatedBag(req: Request) {
  if (!req.validated) req.validated = {};
}

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: formatZodError(result.error),
      });
    }
    ensureValidatedBag(req);
    req.validated.body = result.data as z.infer<T>;
    next();
  };
}

export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid URL parameters",
        errors: formatZodError(result.error),
      });
    }
    ensureValidatedBag(req);
    req.validated.params = result.data as z.infer<T>;
    next();
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid query string",
        errors: formatZodError(result.error),
      });
    }
    ensureValidatedBag(req);
    req.validated.query = result.data as z.infer<T>;
    next();
  };
}

/**
 * Combined validator for routes that need to check more than one source.
 * Pass any subset of body / params / query schemas.
 */
export function validate<
  B extends ZodSchema | undefined = undefined,
  P extends ZodSchema | undefined = undefined,
  Q extends ZodSchema | undefined = undefined,
>(schemas: { body?: B; params?: P; query?: Q }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ source: string; path: string; message: string }> = [];
    ensureValidatedBag(req);

    if (schemas.body) {
      const r = schemas.body.safeParse(req.body);
      if (!r.success) {
        for (const e of formatZodError(r.error)) errors.push({ source: "body", ...e });
      } else {
        req.validated.body = r.data;
      }
    }
    if (schemas.params) {
      const r = schemas.params.safeParse(req.params);
      if (!r.success) {
        for (const e of formatZodError(r.error)) errors.push({ source: "params", ...e });
      } else {
        req.validated.params = r.data;
      }
    }
    if (schemas.query) {
      const r = schemas.query.safeParse(req.query);
      if (!r.success) {
        for (const e of formatZodError(r.error)) errors.push({ source: "query", ...e });
      } else {
        req.validated.query = r.data;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }
    next();
  };
}

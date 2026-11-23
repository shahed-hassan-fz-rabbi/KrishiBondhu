import { env } from "../config/env.config.js";
import { errorResponse } from "../utils/response.js";

/**
 * Lightweight CSRF guard for cookie-authenticated state changes.
 *
 * - Requests carrying an `Origin` header must match an allowed CORS origin.
 * - Requests without an Origin (Bearer token / server-to-server clients) are
 *   allowed, matching the existing API's hybrid auth model.
 * - Skipped in test mode so API tests can exercise handlers directly.
 *
 * This does not weaken browser security: browsers always send Origin on
 * cross-site POST/PATCH, and CORS already restricts allowed origins.
 */
export function requireSameOrigin(req, res, next) {
  if (env.nodeEnv === "test") return next();
  const origin = req.headers.origin;
  if (!origin) return next();

  const configured = Array.isArray(env.corsOrigin) ? env.corsOrigin : [env.corsOrigin];
  const allowed = new Set([
    ...configured.filter(Boolean),
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ]);
  if (allowed.has(origin)) return next();
  return errorResponse(res, 403, "Cross-origin request not allowed", "CSRF_REJECTED");
}

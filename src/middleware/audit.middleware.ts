import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import AuditLog, {
  AuditOutcome,
  AuditSource,
} from "../models/auditlog.model";
import Account from "../models/account.model";
import LoginMapping from "../models/loginmapping.model";
import { AuthenticatedRequest } from "./auth.middleware";

/**
 * Controllers can refine what the recorder infers from the status code — the
 * only case that needs it today is a duplicate call-log upload, which answers
 * with 201 but must not be counted as a newly stored call.
 */
export interface AuditHint {
  outcome?: AuditOutcome;
  callLogId?: Types.ObjectId;
}

const REDACTED = "***";
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
]);
const MAX_BODY_CHARS = 10_000;

const redactBody = (body: unknown): unknown => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body ?? null;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : value;
  }

  const serialized = JSON.stringify(redacted);
  if (serialized && serialized.length > MAX_BODY_CHARS) {
    return { truncated: true, preview: serialized.slice(0, MAX_BODY_CHARS) };
  }

  return redacted;
};

const inferOutcome = (statusCode: number): AuditOutcome => {
  if (statusCode >= 500) return AuditOutcome.FAILED;
  if (statusCode >= 400) return AuditOutcome.REJECTED;
  return AuditOutcome.SUCCESS;
};

/**
 * Best-effort sender identity for requests that never got past auth — an
 * expired token is the usual reason a manager's uploads stop arriving, and an
 * unattributed row would be useless for chasing that down. The token is only
 * *decoded*, never trusted: these entries are always recorded with their 401
 * status, so nothing here grants access or implies a verified identity.
 */
const emailFromUnverifiedToken = (authorizationHeader?: string): string => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  try {
    const decoded = jwt.decode(authorizationHeader.substring(7).trim());
    const email = (decoded as { email?: unknown } | null)?.email;
    return typeof email === "string" ? email.toLowerCase().trim() : "";
  } catch {
    return "";
  }
};

const getClientIp = (req: AuthenticatedRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "";
};

/**
 * Resolves which account manager the request belongs to. Authenticated requests
 * carry it in the token; login attempts only carry an email, and resolving it
 * anyway is what lets an admin see a manager's failed sign-ins next to their
 * uploads.
 */
const resolveAccountId = async (
  req: AuthenticatedRequest,
  fallbackEmail: string
): Promise<Types.ObjectId | null> => {
  if (req.user?.sub) {
    const account = await Account.findById(req.user.sub).select("_id");
    if (account) {
      return account._id as Types.ObjectId;
    }
  }

  if (fallbackEmail) {
    const loginMapping = await LoginMapping.findOne({
      email: fallbackEmail,
    }).select("_id");
    if (loginMapping) {
      const account = await Account.findOne({
        loginMapping: loginMapping._id,
      }).select("_id");
      return (account?._id as Types.ObjectId | undefined) ?? null;
    }
  }

  return null;
};

/**
 * Records every request hitting the endpoint it wraps — successes, rejections,
 * duplicates and crashes alike. Mount it *before* the auth middleware so that
 * requests rejected for a bad or expired token are captured too: those are
 * exactly the ones behind "my calls never reached the CRM" complaints.
 */
export const auditRequest =
  (source: AuditSource) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    const requestBody = redactBody(req.body);
    const emailFromBody =
      typeof (req.body as { email?: unknown } | undefined)?.email === "string"
        ? ((req.body as { email: string }).email).toLowerCase().trim()
        : "";
    // Falls back to the token's claimed email so rejected uploads still name
    // the sender. Captured up front: req.user only exists once auth succeeds.
    const fallbackEmail =
      emailFromBody || emailFromUnverifiedToken(req.headers.authorization);

    let responseBody: { message?: string } | undefined;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body as { message?: string };
      return originalJson(body);
    };

    res.on("finish", () => {
      const hint = (res.locals.audit ?? {}) as AuditHint;

      void (async () => {
        try {
          await AuditLog.create({
            source,
            outcome: hint.outcome ?? inferOutcome(res.statusCode),
            method: req.method,
            path: req.originalUrl.split("?")[0],
            statusCode: res.statusCode,
            message: responseBody?.message ?? "",
            account: await resolveAccountId(req, fallbackEmail),
            actorEmail: req.user?.email ?? fallbackEmail,
            actorRole: req.user?.role ?? "",
            requestBody,
            callLog: hint.callLogId ?? null,
            ip: getClientIp(req),
            userAgent: req.headers["user-agent"] ?? "",
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          // Auditing must never break or slow the client request.
          console.error("auditRequest:", error);
        }
      })();
    });

    next();
  };

import { Document, Schema, Types, model } from "mongoose";

/** Which client-facing endpoint produced this entry. */
export enum AuditSource {
  CALL_LOG_CREATE = "CALL_LOG_CREATE",
  LOGIN = "LOGIN",
}

/**
 * What actually happened with the request. Duplicates are recorded separately
 * from plain successes because the Flutter app retries uploads, and admins need
 * to tell "we already had this call" apart from "this call was new".
 */
export enum AuditOutcome {
  SUCCESS = "SUCCESS",
  DUPLICATE = "DUPLICATE",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
}

export interface IAuditLog extends Document {
  source: AuditSource;
  outcome: AuditOutcome;
  method: string;
  path: string;
  statusCode: number;
  message: string;
  account: Types.ObjectId | null;
  actorEmail: string;
  actorRole: string;
  requestBody: unknown;
  callLog: Types.ObjectId | null;
  ip: string;
  userAgent: string;
  durationMs: number;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    source: {
      type: String,
      enum: Object.values(AuditSource),
      required: true,
      index: true,
    },
    outcome: {
      type: String,
      enum: Object.values(AuditOutcome),
      required: true,
      index: true,
    },
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    message: { type: String, default: "" },
    account: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    actorEmail: { type: String, default: "", trim: true, lowercase: true },
    actorRole: { type: String, default: "" },
    requestBody: { type: Schema.Types.Mixed, default: null },
    callLog: {
      type: Schema.Types.ObjectId,
      ref: "CallLog",
      default: null,
    },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The admin list is always sorted newest-first, optionally scoped to one account.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ account: 1, createdAt: -1 });

const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);

export default AuditLog;

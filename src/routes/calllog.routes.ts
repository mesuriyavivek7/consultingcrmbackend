import { Router } from "express";
import { createCallLog, getAllCallLogs } from "../controller/calllog.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { requireRole, verifyAccessToken } from "../middleware/auth.middleware";
import { AuditSource } from "../models/auditlog.model";
import { LoginRole } from "../models/loginmapping.model";

const router = Router();

// auditRequest runs before verifyAccessToken on purpose: an upload rejected for
// a bad or expired token must still show up in the admin audit trail.
router.post(
  "/",
  auditRequest(AuditSource.CALL_LOG_CREATE),
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  createCallLog
);
router.get(
  "/",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN, LoginRole.ACCOUNT),
  getAllCallLogs
);

export default router;

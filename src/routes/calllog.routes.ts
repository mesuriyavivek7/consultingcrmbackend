import { Router } from "express";
import { createCallLog, getAllCallLogs } from "../controller/calllog.controller";
import { requireRole, verifyAccessToken } from "../middleware/auth.middleware";
import { LoginRole } from "../models/loginmapping.model";

const router = Router();

router.post(
  "/",
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

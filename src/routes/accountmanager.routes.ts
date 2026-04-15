import { Router } from "express";
import {
  getAccountManagerDashboard,
  getAccountManagerCallLogs,
} from "../controller/account.controller";
import { verifyAccessToken, requireRole } from "../middleware/auth.middleware";
import { LoginRole } from "../models/loginmapping.model";

const router = Router();

router.get(
  "/dashboard",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  getAccountManagerDashboard
);

router.get(
  "/call-logs",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  getAccountManagerCallLogs
);

export default router;

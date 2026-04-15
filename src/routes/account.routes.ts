import { Router } from "express";
import {
  getAccountManagerDashboard,
  getAccountManagerProfile,
  updateAccountManagerProfile,
  changeAccountPassword,
} from "../controller/account.controller";
import { requireRole, verifyAccessToken } from "../middleware/auth.middleware";
import { LoginRole } from "../models/loginmapping.model";

const router = Router();

router.get(
  "/dashboard",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  getAccountManagerDashboard
);

router.get(
  "/profile",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  getAccountManagerProfile
);

router.patch(
  "/profile",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  updateAccountManagerProfile
);

router.patch(
  "/change-password",
  verifyAccessToken,
  requireRole(LoginRole.ACCOUNT),
  changeAccountPassword
);

export default router;

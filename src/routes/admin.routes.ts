import { Router } from "express";
import {
  changeAdminPassword,
  getAdminDashboard,
  getAdminProfile,
  registerAdmin,
  updateAdminProfile,
} from "../controller/admin.controller";
import {
  changeAccountManagerPasswordByAdmin,
  createAccountManagerByAdmin,
  deleteAccountManagerByAdmin,
  getAllAccountManagersByAdmin,
  toggleAccountManagerStatusByAdmin,
  updateAccountManagerByAdmin,
} from "../controller/account.controller";
import { getAuditLogs } from "../controller/auditlog.controller";
import { getSettings, updateSettings } from "../controller/settings.controller";
import { requireRole, verifyAccessToken } from "../middleware/auth.middleware";
import { LoginRole } from "../models/loginmapping.model";

const router = Router();

router.post("/register", registerAdmin);
router.post(
  "/account-manager",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  createAccountManagerByAdmin
);
router.get(
  "/account-manager",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getAllAccountManagersByAdmin
);
router.patch(
  "/account-manager/:id",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  updateAccountManagerByAdmin
);
router.patch(
  "/account-manager/:id/status",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  toggleAccountManagerStatusByAdmin
);
router.patch(
  "/account-manager/:id/password",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  changeAccountManagerPasswordByAdmin
);
router.delete(
  "/account-manager/:id",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  deleteAccountManagerByAdmin
);
router.get(
  "/dashboard",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getAdminDashboard
);
router.get(
  "/profile",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getAdminProfile
);
router.patch(
  "/profile",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  updateAdminProfile
);
router.patch(
  "/change-password",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  changeAdminPassword
);
router.get(
  "/audit-logs",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getAuditLogs
);
router.get(
  "/settings",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getSettings
);
router.patch(
  "/settings",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  updateSettings
);

export default router;

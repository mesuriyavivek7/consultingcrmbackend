import { Router } from "express";
import { getAdminDashboard, registerAdmin } from "../controller/admin.controller";
import {
  createAccountManagerByAdmin,
  deleteAccountManagerByAdmin,
  getAllAccountManagersByAdmin,
  toggleAccountManagerStatusByAdmin,
  updateAccountManagerByAdmin,
} from "../controller/account.controller";
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

import { Router } from "express";
import { getAdminDashboard, registerAdmin } from "../controller/admin.controller";
import {
  createAccountManagerByAdmin,
  getAllAccountManagersByAdmin,
} from "../controller/account.controller";
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
router.get(
  "/dashboard",
  verifyAccessToken,
  requireRole(LoginRole.ADMIN),
  getAdminDashboard
);

export default router;

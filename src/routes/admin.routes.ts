import { Router } from "express";
import { registerAdmin } from "../controller/admin.controller";
import { createAccountManagerByAdmin } from "../controller/account.controller";
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

export default router;

import { Router } from "express";
import { login } from "../controller/auth.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { AuditSource } from "../models/auditlog.model";

const router = Router();

router.post("/login", auditRequest(AuditSource.LOGIN), login);

export default router;

import { Request, Response } from "express";
import LoginMapping, { AccountStatus, LoginRole } from "../models/loginmapping.model";
import Admin from "../models/admin.model";
import Account from "../models/account.model";
import { verifyPassword } from "../utils/password";
import { signAccessToken } from "../utils/jwt";
import { sendError, sendSuccess } from "../utils/apiResponse";

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password) {
      sendError(res, 400, "email and password are required");
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const loginMapping = await LoginMapping.findOne({
      email: normalizedEmail,
    });

    if (!loginMapping || !verifyPassword(password, loginMapping.password)) {
      sendError(res, 401, "Invalid email or password.");
      return;
    }

    if (loginMapping.status !== AccountStatus.ACTIVE) {
      sendError(res, 403, "Your account is inactive. Please contact admin.");
      return;
    }

    if (loginMapping.role === LoginRole.ADMIN) {
      const admin = await Admin.findOne({ loginMapping: loginMapping._id });
      if (!admin) {
        sendError(res, 500, "Admin profile not found for this account.");
        return;
      }

      const accessToken = signAccessToken({
        sub: String(admin._id),
        email: loginMapping.email,
        role: loginMapping.role,
      });

      sendSuccess(res, 200, "Login successful", {
        id: admin._id,
        email: loginMapping.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: loginMapping.role,
        accessToken,
      });
      return;
    }

    if (loginMapping.role === LoginRole.ACCOUNT) {
      const account = await Account.findOne({ loginMapping: loginMapping._id });
      if (!account || account.deletedAt !== null) {
        sendError(res, 404, "Account not found.");
        return;
      }

      const accessToken = signAccessToken({
        sub: String(account._id),
        email: loginMapping.email,
        role: loginMapping.role,
      });

      sendSuccess(res, 200, "Login successful", {
        id: account._id,
        email: loginMapping.email,
        firstName: account.firstName,
        lastName: account.lastName,
        role: loginMapping.role,
        accessToken,
      });
      return;
    }

    sendError(res, 403, "Unsupported role");
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "JWT_SECRET is not set") {
      sendError(res, 500, "Server configuration error");
      return;
    }
    console.error("login:", error);
    sendError(res, 500, "Login failed");
  }
};

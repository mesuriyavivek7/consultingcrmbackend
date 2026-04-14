import { Request, Response } from "express";
import LoginMapping, {
  AccountStatus,
  LoginRole,
} from "../models/loginmapping.model";
import Admin from "../models/admin.model";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { hashPassword } from "../utils/password";

export const registerAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { firstName, lastName, email, password, mobileNo } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      mobileNo?: string;
    };

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !password ||
      !mobileNo?.trim()
    ) {
      sendError(
        res,
        400,
        "firstName, lastName, email, password, and mobileNo are required"
      );
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingLogin = await LoginMapping.findOne({
      email: normalizedEmail,
    });
    if (existingLogin) {
      sendError(res, 409, "Email is already registered");
      return;
    }

    const hashedPassword = hashPassword(password);

    const loginMapping = await LoginMapping.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: LoginRole.ADMIN,
      status: AccountStatus.ACTIVE,
    });

    try {
      const admin = await Admin.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNo: mobileNo.trim(),
        loginMapping: loginMapping._id,
      });

      sendSuccess(res, 201, "Admin registered successfully", {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        mobileNo: admin.mobileNo,
        email: loginMapping.email,
      });
    } catch (adminErr) {
      await LoginMapping.findByIdAndDelete(loginMapping._id);
      throw adminErr;
    }
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      sendError(res, 409, "Duplicate value (email or mobile)");
      return;
    }

    if (error instanceof Error && error.name === "ValidationError") {
      sendError(res, 400, error.message);
      return;
    }

    console.error("registerAdmin:", error);
    sendError(res, 500, "Failed to register admin");
  }
};

import { Response } from "express";
import Account from "../models/account.model";
import LoginMapping, {
  AccountStatus,
  LoginRole,
} from "../models/loginmapping.model";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { hashPassword } from "../utils/password";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

const generateSixDigitId = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateUniqueAccountId = async (): Promise<string> => {
  const MAX_RETRIES = 10;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const candidateId = generateSixDigitId();
    const existingAccount = await Account.findOne({ uniqueId: candidateId });

    if (!existingAccount) {
      return candidateId;
    }
  }

  throw new Error("Unable to generate a unique account ID");
};

export const createAccountManagerByAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { firstName, lastName, email, password, mobileNo, status } =
      req.body as {
        firstName?: string;
        lastName?: string;
        email?: string;
        password?: string;
        mobileNo?: string;
        status?: AccountStatus;
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

    if (status && !Object.values(AccountStatus).includes(status)) {
      sendError(res, 400, "status must be ACTIVE or INACTIVE");
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedMobileNo = mobileNo.trim();

    const existingLogin = await LoginMapping.findOne({ email: normalizedEmail });
    if (existingLogin) {
      sendError(res, 409, "Email is already registered");
      return;
    }

    const hashedPassword = hashPassword(password);
    const uniqueId = await generateUniqueAccountId();

    const loginMapping = await LoginMapping.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: LoginRole.ACCOUNT,
      status: status ?? AccountStatus.ACTIVE,
    });

    try {
      const accountManager = await Account.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNo: normalizedMobileNo,
        uniqueId,
        loginMapping: loginMapping._id,
        createdBy: req.user.sub,
      });

      sendSuccess(res, 201, "Account manager created successfully", {
        id: accountManager._id,
        uniqueId: accountManager.uniqueId,
        firstName: accountManager.firstName,
        lastName: accountManager.lastName,
        mobileNo: accountManager.mobileNo,
        email: loginMapping.email,
        role: loginMapping.role,
        status: loginMapping.status,
        createdBy: accountManager.createdBy,
      });
    } catch (accountError) {
      await LoginMapping.findByIdAndDelete(loginMapping._id);
      throw accountError;
    }
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      sendError(res, 409, "Duplicate value (email, mobile number, or unique ID)");
      return;
    }

    if (error instanceof Error && error.name === "ValidationError") {
      sendError(res, 400, error.message);
      return;
    }

    console.error("createAccountManagerByAdmin:", error);
    sendError(res, 500, "Failed to create account manager");
  }
};

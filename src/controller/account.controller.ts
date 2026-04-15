import { Response } from "express";
import mongoose from "mongoose";
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

export const getAllAccountManagersByAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { page, limit, search, status } = req.query as {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;
    };
    const pageNumber = Number(page ?? 1);
    const limitNumber = Number(limit ?? 10);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1
    ) {
      sendError(res, 400, "page and limit must be positive integers");
      return;
    }

    const safeLimit = Math.min(limitNumber, 100);
    const skip = (pageNumber - 1) * safeLimit;

    const normalizedStatus = status?.trim().toUpperCase();
    if (
      normalizedStatus &&
      !Object.values(AccountStatus).includes(normalizedStatus as AccountStatus)
    ) {
      sendError(res, 400, "status must be ACTIVE or INACTIVE");
      return;
    }

    const escapedSearch = search?.trim()
      ? search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "";
    const searchRegex = escapedSearch ? new RegExp(escapedSearch, "i") : null;

    const matchStage: Record<string, unknown> = {};
    if (normalizedStatus) {
      matchStage["login.status"] = normalizedStatus;
    }

    if (searchRegex) {
      matchStage.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { "login.email": searchRegex },
        { mobileNo: searchRegex },
      ];
    }

    const basePipeline = [
      { $match: { deletedAt: null } },
      {
        $lookup: {
          from: "loginmappings",
          localField: "loginMapping",
          foreignField: "_id",
          as: "login",
        },
      },
      { $unwind: "$login" },
      {
        $lookup: {
          from: "admins",
          localField: "createdBy",
          foreignField: "_id",
          as: "creatorAdmin",
        },
      },
      {
        $unwind: {
          path: "$creatorAdmin",
          preserveNullAndEmptyArrays: true,
        },
      },
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
    ];

    const [countResult, items] = await Promise.all([
      Account.aggregate([...basePipeline, { $count: "total" }]),
      Account.aggregate([
        ...basePipeline,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: safeLimit },
        {
          $project: {
            _id: 1,
            uniqueId: 1,
            firstName: 1,
            lastName: 1,
            mobileNo: 1,
            email: "$login.email",
            status: "$login.status",
            role: "$login.role",
            createdBy: {
              id: "$creatorAdmin._id",
              fullName: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: ["$creatorAdmin.firstName", ""] },
                      " ",
                      { $ifNull: ["$creatorAdmin.lastName", ""] },
                    ],
                  },
                },
              },
              mobileNo: "$creatorAdmin.mobileNo",
            },
          },
        },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;

    const formattedItems = items.map((item) => ({
      id: item._id,
      uniqueId: item.uniqueId,
      firstName: item.firstName,
      lastName: item.lastName,
      mobileNo: item.mobileNo,
      email: item.email ?? "",
      status: item.status ?? "",
      role: item.role ?? "",
      createdBy: item.createdBy?.id
        ? {
            id: String(item.createdBy.id),
            fullName: item.createdBy.fullName ?? "",
            mobileNo: item.createdBy.mobileNo ?? "",
          }
        : null,
    }));

    sendSuccess(res, 200, "Account managers fetched successfully", {
      items: formattedItems,
      pagination: {
        total,
        page: pageNumber,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error: unknown) {
    console.error("getAllAccountManagersByAdmin:", error);
    sendError(res, 500, "Failed to fetch account managers");
  }
};

export const updateAccountManagerByAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const id = req.params.id as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, 400, "Invalid account manager ID");
      return;
    }

    const { firstName, lastName, mobileNo, email, status } = req.body as {
      firstName?: string;
      lastName?: string;
      mobileNo?: string;
      email?: string;
      status?: AccountStatus;
    };

    if (!firstName?.trim() && !lastName?.trim() && !mobileNo?.trim() && !email?.trim() && !status) {
      sendError(res, 400, "At least one field (firstName, lastName, mobileNo, email, status) is required");
      return;
    }

    if (status && !Object.values(AccountStatus).includes(status)) {
      sendError(res, 400, "status must be ACTIVE or INACTIVE");
      return;
    }

    const accountManager = await Account.findOne({ _id: id, deletedAt: null });
    if (!accountManager) {
      sendError(res, 404, "Account manager not found");
      return;
    }

    if (firstName?.trim()) accountManager.firstName = firstName.trim();
    if (lastName?.trim()) accountManager.lastName = lastName.trim();
    if (mobileNo?.trim()) accountManager.mobileNo = mobileNo.trim();
    await accountManager.save();

    const loginMappingUpdates: Record<string, string> = {};

    if (email?.trim()) {
      const normalizedEmail = email.toLowerCase().trim();
      const duplicate = await LoginMapping.findOne({
        email: normalizedEmail,
        _id: { $ne: accountManager.loginMapping },
      });
      if (duplicate) {
        sendError(res, 409, "Email is already registered");
        return;
      }
      loginMappingUpdates.email = normalizedEmail;
    }

    if (status) {
      loginMappingUpdates.status = status;
    }

    if (Object.keys(loginMappingUpdates).length) {
      await LoginMapping.findByIdAndUpdate(accountManager.loginMapping, loginMappingUpdates);
    }

    const loginMapping = await LoginMapping.findById(accountManager.loginMapping);

    sendSuccess(res, 200, "Account manager updated successfully", {
      id: accountManager._id,
      uniqueId: accountManager.uniqueId,
      firstName: accountManager.firstName,
      lastName: accountManager.lastName,
      mobileNo: accountManager.mobileNo,
      email: loginMapping?.email ?? "",
      role: loginMapping?.role ?? "",
      status: loginMapping?.status ?? "",
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ValidationError") {
      sendError(res, 400, error.message);
      return;
    }
    console.error("updateAccountManagerByAdmin:", error);
    sendError(res, 500, "Failed to update account manager");
  }
};

export const toggleAccountManagerStatusByAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const id = req.params.id as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, 400, "Invalid account manager ID");
      return;
    }

    const { status } = req.body as { status?: AccountStatus };
    if (!status || !Object.values(AccountStatus).includes(status)) {
      sendError(res, 400, "status must be ACTIVE or INACTIVE");
      return;
    }

    const accountManager = await Account.findOne({ _id: id, deletedAt: null });
    if (!accountManager) {
      sendError(res, 404, "Account manager not found");
      return;
    }

    const loginMapping = await LoginMapping.findByIdAndUpdate(
      accountManager.loginMapping,
      { status },
      { new: true }
    );

    if (!loginMapping) {
      sendError(res, 404, "Login mapping not found for this account manager");
      return;
    }

    sendSuccess(res, 200, "Account manager status updated successfully", {
      id: accountManager._id,
      uniqueId: accountManager.uniqueId,
      firstName: accountManager.firstName,
      lastName: accountManager.lastName,
      status: loginMapping.status,
    });
  } catch (error: unknown) {
    console.error("toggleAccountManagerStatusByAdmin:", error);
    sendError(res, 500, "Failed to update account manager status");
  }
};

export const deleteAccountManagerByAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const id = req.params.id as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, 400, "Invalid account manager ID");
      return;
    }

    const accountManager = await Account.findOne({ _id: id, deletedAt: null });
    if (!accountManager) {
      sendError(res, 404, "Account manager not found");
      return;
    }

    accountManager.deletedAt = new Date();
    await accountManager.save();

    sendSuccess(res, 200, "Account manager deleted successfully", null);
  } catch (error: unknown) {
    console.error("deleteAccountManagerByAdmin:", error);
    sendError(res, 500, "Failed to delete account manager");
  }
};

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

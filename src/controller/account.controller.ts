import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import LoginMapping, {
  AccountStatus,
  LoginRole,
} from "../models/loginmapping.model";
import CallLog from "../models/calllog.model";
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

const TARGET_CALLS = 250;
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getStartOfDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getEndOfDay = (date: Date): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getStartOfCurrentWeek = (date: Date): Date => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const getAccountManagerDashboard = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const accountManager = await Account.findById(req.user.sub).populate("loginMapping", "email status");
    if (!accountManager) {
      sendError(res, 404, "Account manager profile not found");
      return;
    }

    const now = new Date();
    const startOfToday = getStartOfDay(now);
    const endOfToday = getEndOfDay(now);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(endOfToday);
    endOfYesterday.setDate(endOfYesterday.getDate() - 1);

    const startOfWeek = getStartOfCurrentWeek(now);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const accountId = new Types.ObjectId(req.user.sub);

    const [
      todaysTotalCalls,
      yesterdaysTotalCalls,
      totalCallsOverall,
      weeklyAggregation,
      monthlyAggregation,
    ] = await Promise.all([
      CallLog.countDocuments({ calledBy: accountId, callStart: { $gte: startOfToday, $lte: endOfToday } }),
      CallLog.countDocuments({ calledBy: accountId, callStart: { $gte: startOfYesterday, $lte: endOfYesterday } }),
      CallLog.countDocuments({ calledBy: accountId }),
      CallLog.aggregate([
        { $match: { calledBy: accountId, callStart: { $gte: startOfWeek, $lte: endOfWeek } } },
        {
          $group: {
            _id: { $isoDayOfWeek: "$callStart" },
            calls: { $sum: 1 },
          },
        },
      ]),
      CallLog.aggregate([
        { $match: { calledBy: accountId, callStart: { $gte: startOfYear, $lte: endOfYear } } },
        {
          $group: {
            _id: { $month: "$callStart" },
            calls: { $sum: 1 },
          },
        },
      ]),
    ]);

    const weeklyMap = new Map<number, number>();
    weeklyAggregation.forEach((entry) => {
      weeklyMap.set(Number(entry._id), Number(entry.calls));
    });

    const monthlyMap = new Map<number, number>();
    monthlyAggregation.forEach((entry) => {
      monthlyMap.set(Number(entry._id), Number(entry.calls));
    });

    const weeklyData = WEEK_LABELS.map((label, index) => ({
      label,
      calls: weeklyMap.get(index + 1) ?? 0,
    }));

    const monthlyData = MONTH_LABELS.map((label, index) => ({
      label,
      calls: monthlyMap.get(index + 1) ?? 0,
    }));

    const progressPercentage = TARGET_CALLS > 0
      ? Number(((todaysTotalCalls / TARGET_CALLS) * 100).toFixed(2))
      : 0;

    const changeFromYesterdayPercent = yesterdaysTotalCalls > 0
      ? Number((((todaysTotalCalls - yesterdaysTotalCalls) / yesterdaysTotalCalls) * 100).toFixed(2))
      : todaysTotalCalls > 0 ? 100 : 0;

    const accountLogin = accountManager.loginMapping as { email?: string; status?: AccountStatus } | null;

    sendSuccess(res, 200, "Account manager dashboard fetched successfully", {
      profile: {
        fullName: `${accountManager.firstName} ${accountManager.lastName}`.trim(),
        email: accountLogin?.email ?? "",
        mobileNo: accountManager.mobileNo,
        uniqueId: accountManager.uniqueId,
        status: accountLogin?.status ?? "INACTIVE",
      },
      metrics: {
        todaysTotalCalls,
        totalCallsOverall,
        monthlyTarget: TARGET_CALLS,
      },
      callAnalytics: {
        weeklyData,
        monthlyData,
      },
      todaysOverview: {
        todaysTotalCalls,
        targetCalls: TARGET_CALLS,
        progressPercentage: Math.min(progressPercentage, 100),
        changeFromYesterdayPercent,
      },
    });
  } catch (error: unknown) {
    console.error("getAccountManagerDashboard:", error);
    sendError(res, 500, "Failed to fetch account manager dashboard");
  }
};

export const getAccountManagerCallLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { page, limit } = req.query as {
      page?: string;
      limit?: string;
    };

    const pageNumber = Number(page ?? 1);
    const limitNumber = Number(limit ?? 10);

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(limitNumber) || limitNumber < 1) {
      sendError(res, 400, "page and limit must be positive integers");
      return;
    }

    const safeLimit = Math.min(limitNumber, 100);
    const skip = (pageNumber - 1) * safeLimit;

    const accountId = new Types.ObjectId(req.user.sub);
    const query: Record<string, unknown> = { calledBy: accountId };

    const [total, items] = await Promise.all([
      CallLog.countDocuments(query),
      CallLog.find(query)
        .sort({ callStart: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("calledBy", "firstName lastName mobileNo uniqueId")
        .lean(),
    ]);

    sendSuccess(res, 200, "Call logs fetched successfully", {
      items,
      pagination: {
        total,
        page: pageNumber,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error: unknown) {
    console.error("getAccountManagerCallLogs:", error);
    sendError(res, 500, "Failed to fetch call logs");
  }
};

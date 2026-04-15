import { Request, Response } from "express";
import LoginMapping, {
  AccountStatus,
  LoginRole,
} from "../models/loginmapping.model";
import Admin from "../models/admin.model";
import Account from "../models/account.model";
import CallLog from "../models/calllog.model";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
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

const TARGET_CALLS_PER_ACCOUNT_MANAGER = 250;
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

export const getAdminDashboard = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const admin = await Admin.findById(req.user.sub).populate("loginMapping", "email");
    if (!admin) {
      sendError(res, 404, "Admin profile not found");
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

    const [
      totalAccountManagers,
      todaysTotalCalls,
      yesterdaysTotalCalls,
      totalCallsOverall,
      weeklyAggregation,
      monthlyAggregation,
    ] = await Promise.all([
      Account.countDocuments({}),
      CallLog.countDocuments({ callStart: { $gte: startOfToday, $lte: endOfToday } }),
      CallLog.countDocuments({
        callStart: { $gte: startOfYesterday, $lte: endOfYesterday },
      }),
      CallLog.countDocuments({}),
      CallLog.aggregate([
        { $match: { callStart: { $gte: startOfWeek, $lte: endOfWeek } } },
        { $group: { _id: { $isoDayOfWeek: "$callStart" }, calls: { $sum: 1 } } },
      ]),
      CallLog.aggregate([
        { $match: { callStart: { $gte: startOfYear, $lte: endOfYear } } },
        { $group: { _id: { $month: "$callStart" }, calls: { $sum: 1 } } },
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

    const targetCallsForToday = totalAccountManagers * TARGET_CALLS_PER_ACCOUNT_MANAGER;
    const progressPercentage =
      targetCallsForToday > 0
        ? Number(((todaysTotalCalls / targetCallsForToday) * 100).toFixed(2))
        : 0;

    const changeFromYesterdayPercent =
      yesterdaysTotalCalls > 0
        ? Number(
            (
              ((todaysTotalCalls - yesterdaysTotalCalls) / yesterdaysTotalCalls) *
              100
            ).toFixed(2)
          )
        : todaysTotalCalls > 0
          ? 100
          : 0;

    const adminLogin = admin.loginMapping as { email?: string } | null;

    sendSuccess(res, 200, "Admin dashboard fetched successfully", {
      adminProfile: {
        fullName: `${admin.firstName} ${admin.lastName}`.trim(),
        email: adminLogin?.email ?? "",
        mobileNo: admin.mobileNo,
      },
      metrics: {
        todaysTotalCalls,
        totalCallsOverall,
        totalAccountManagers,
      },
      callAnalytics: {
        weeklyData,
        monthlyData,
      },
      todaysOverview: {
        todaysTotalCalls,
        targetCallsForToday,
        progressPercentage: Math.min(progressPercentage, 100),
        changeFromYesterdayPercent,
      },
    });
  } catch (error: unknown) {
    console.error("getAdminDashboard:", error);
    sendError(res, 500, "Failed to fetch admin dashboard");
  }
};

import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import CallLog, { CallType } from "../models/calllog.model";
import { LoginRole } from "../models/loginmapping.model";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendError, sendSuccess } from "../utils/apiResponse";

const normalizeToNumber = (value: string): string => value.replace(/\s+/g, "").trim();

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createCallLog = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { to, callStart, callEnd, duration, callType } = req.body as {
      to?: string;
      callStart?: string;
      callEnd?: string;
      duration?: number;
      callType?: CallType;
    };

    if (!to?.trim() || !callStart || !callEnd || !callType) {
      sendError(res, 400, "to, callStart, callEnd and callType are required");
      return;
    }

    if (!Object.values(CallType).includes(callType)) {
      sendError(res, 400, "callType must be INCOMING or OUTGOING");
      return;
    }

   let normalizedTo = to.replace(/\D/g, ""); // remove non-digits

   if (normalizedTo.length === 10) {
      normalizedTo = `+91${normalizedTo}`;
   } else if (!to.startsWith("+")) {
      normalizedTo = `+${normalizedTo}`;
   } else {
      normalizedTo = `+${normalizedTo}`;
   }

    const startAt = new Date(callStart);
    const endAt = new Date(callEnd);
    if (!isValidDate(startAt) || !isValidDate(endAt)) {
      sendError(res, 400, "callStart and callEnd must be valid datetime values");
      return;
    }

    const computedDuration = Math.floor((endAt.getTime() - startAt.getTime()) / 1000);
    const durationInSeconds = duration ?? computedDuration;

    if (durationInSeconds < 0) {
      sendError(res, 400, "duration cannot be negative and callEnd must be after callStart");
      return;
    }

    const calledByAccountId = req.user.sub;
    if (!Types.ObjectId.isValid(calledByAccountId)) {
      sendError(res, 400, "Invalid account manager id in token");
      return;
    }

    const accountManager = await Account.findById(calledByAccountId);
    if (!accountManager) {
      sendError(res, 404, "Account manager not found");
      return;
    }

    const existingCallLog = await CallLog.findOne({
      to: normalizedTo,
      calledBy: accountManager._id,
      callStart: startAt,
      callEnd: endAt,
      duration: durationInSeconds,
      callType,
    });

    if (existingCallLog) {
      sendSuccess(res, 201, "Call log already exists", existingCallLog);
      return;
    }

    const callLog = await CallLog.create({
      to: normalizedTo,
      calledBy: accountManager._id,
      callStart: startAt,
      callEnd: endAt,
      duration: durationInSeconds,
      callType,
    });

    sendSuccess(res, 201, "Call log created successfully", callLog);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ValidationError") {
      sendError(res, 400, error.message);
      return;
    }

    console.error("createCallLog:", error);
    sendError(res, 500, "Failed to create call log");
  }
};

export const getAllCallLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub || !req.user.role) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { search, callType, dateFilter, page, limit } = req.query as {
      search?: string;
      callType?: string;
      dateFilter?: string;
      page?: string;
      limit?: string;
    };

    const normalizedCallType = callType?.trim().toUpperCase();
    if (
      normalizedCallType &&
      !Object.values(CallType).includes(normalizedCallType as CallType)
    ) {
      sendError(res, 400, "callType must be INCOMING or OUTGOING");
      return;
    }

    const normalizedDateFilter = dateFilter?.trim().toLowerCase() ?? "all";
    if (!["all", "today"].includes(normalizedDateFilter)) {
      sendError(res, 400, "dateFilter must be all or today");
      return;
    }

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

    const filters: Record<string, unknown> = {};

    if (req.user.role === LoginRole.ACCOUNT) {
      filters.calledBy = req.user.sub;
    }

    if (normalizedCallType) {
      filters.callType = normalizedCallType;
    }

    if (normalizedDateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      filters.callStart = { $gte: startOfDay, $lte: endOfDay };
    }

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      const normalizedSearchTo = normalizeToNumber(search.trim());

      const accountManagerFilter: Record<string, unknown> = {
        $or: [{ firstName: regex }, { lastName: regex }],
      };

      if (req.user.role === LoginRole.ACCOUNT) {
        accountManagerFilter._id = req.user.sub;
      }

      const matchingAccountManagers = await Account.find(accountManagerFilter).select("_id");
      const matchingIds = matchingAccountManagers.map((account) => account._id);

      const orConditions: Array<Record<string, unknown>> = [
        { to: { $regex: escapeRegex(normalizedSearchTo), $options: "i" } },
      ];

      if (matchingIds.length) {
        orConditions.push({ calledBy: { $in: matchingIds } });
      }

      const baseAndFilters = filters.$and as Array<Record<string, unknown>> | undefined;
      filters.$and = [...(baseAndFilters ?? []), { $or: orConditions }];
    }

    const [totalCount, callLogs] = await Promise.all([
      CallLog.countDocuments(filters),
      CallLog.find(filters)
        .populate("calledBy", "firstName lastName uniqueId mobileNo")
        .sort({ callStart: -1 })
        .skip(skip)
        .limit(safeLimit),
    ]);

    sendSuccess(res, 200, "Call logs fetched successfully", {
      data: callLogs,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: safeLimit,
        totalPages: Math.ceil(totalCount / safeLimit),
      },
      appliedFilters: {
        search: search?.trim() ?? "",
        callType: normalizedCallType ?? "",
        dateFilter: normalizedDateFilter,
      },
    });
  } catch (error: unknown) {
    console.error("getAllCallLogs:", error);
    sendError(res, 500, "Failed to fetch call logs");
  }
};

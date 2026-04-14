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

    const normalizedTo = normalizeToNumber(to);
    if (!/^\+\d{8,15}$/.test(normalizedTo)) {
      sendError(res, 400, "to must be in +<countrycode><mobileno> format");
      return;
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

    const { search, to, callType } = req.query as {
      search?: string;
      to?: string;
      callType?: CallType;
    };

    if (callType && !Object.values(CallType).includes(callType)) {
      sendError(res, 400, "callType must be INCOMING or OUTGOING");
      return;
    }

    const filters: Record<string, unknown> = {};

    if (req.user.role === LoginRole.ACCOUNT) {
      filters.calledBy = req.user.sub;
    }

    if (to?.trim()) {
      filters.to = { $regex: escapeRegex(normalizeToNumber(to)), $options: "i" };
    }

    if (callType) {
      filters.callType = callType;
    }

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      const accountManagerFilter =
        req.user.role === LoginRole.ACCOUNT
          ? { _id: req.user.sub, $or: [{ firstName: regex }, { lastName: regex }] }
          : { $or: [{ firstName: regex }, { lastName: regex }] };

      const matchingAccountManagers = await Account.find(accountManagerFilter).select(
        "_id"
      );
      const matchingIds = matchingAccountManagers.map((account) => account._id);

      if (!matchingIds.length) {
        sendSuccess(res, 200, "Call logs fetched successfully", []);
        return;
      }

      filters.calledBy = { $in: matchingIds };
    }

    const callLogs = await CallLog.find(filters)
      .populate("calledBy", "firstName lastName uniqueId mobileNo")
      .sort({ createdAt: -1 });

    sendSuccess(res, 200, "Call logs fetched successfully", callLogs);
  } catch (error: unknown) {
    console.error("getAllCallLogs:", error);
    sendError(res, 500, "Failed to fetch call logs");
  }
};

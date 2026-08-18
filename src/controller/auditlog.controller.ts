import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import AuditLog, {
  AuditOutcome,
  AuditSource,
} from "../models/auditlog.model";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { endOfBusinessDay, startOfBusinessDay } from "../utils/date";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const {
      search,
      source,
      outcome,
      accountManagerId,
      startDate,
      endDate,
      page,
      limit,
    } = req.query as {
      search?: string;
      source?: string;
      outcome?: string;
      accountManagerId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    };

    const normalizedSource = source?.trim().toUpperCase();
    if (
      normalizedSource &&
      !Object.values(AuditSource).includes(normalizedSource as AuditSource)
    ) {
      sendError(
        res,
        400,
        `source must be one of ${Object.values(AuditSource).join(", ")}`
      );
      return;
    }

    const normalizedOutcome = outcome?.trim().toUpperCase();
    if (
      normalizedOutcome &&
      !Object.values(AuditOutcome).includes(normalizedOutcome as AuditOutcome)
    ) {
      sendError(
        res,
        400,
        `outcome must be one of ${Object.values(AuditOutcome).join(", ")}`
      );
      return;
    }

    const requestedAccountManagerId = accountManagerId?.trim();
    if (
      requestedAccountManagerId &&
      !Types.ObjectId.isValid(requestedAccountManagerId)
    ) {
      sendError(res, 400, "accountManagerId must be a valid id");
      return;
    }

    const rawStartDate = startDate?.trim();
    const rawEndDate = endDate?.trim();

    const rangeStart = rawStartDate ? startOfBusinessDay(rawStartDate) : null;
    if (rawStartDate && !rangeStart) {
      sendError(res, 400, "startDate must be a valid YYYY-MM-DD date");
      return;
    }

    const rangeEnd = rawEndDate ? endOfBusinessDay(rawEndDate) : null;
    if (rawEndDate && !rangeEnd) {
      sendError(res, 400, "endDate must be a valid YYYY-MM-DD date");
      return;
    }

    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      sendError(res, 400, "startDate cannot be after endDate");
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

    if (normalizedSource) filters.source = normalizedSource;
    if (normalizedOutcome) filters.outcome = normalizedOutcome;
    if (requestedAccountManagerId) filters.account = requestedAccountManagerId;

    if (rangeStart || rangeEnd) {
      const range: Record<string, Date> = {};
      if (rangeStart) range.$gte = rangeStart;
      if (rangeEnd) range.$lte = rangeEnd;
      filters.createdAt = range;
    }

    if (search?.trim()) {
      const term = search.trim();
      const regex = new RegExp(escapeRegex(term), "i");
      // A complaint usually starts from a phone number or a person, so search
      // covers the dialled number in the payload, the actor, and the response.
      const digitsOnly = term.replace(/\D/g, "");

      const orConditions: Array<Record<string, unknown>> = [
        { actorEmail: regex },
        { message: regex },
        { ip: regex },
      ];

      if (digitsOnly) {
        orConditions.push({
          "requestBody.to": { $regex: escapeRegex(digitsOnly), $options: "i" },
        });
      }

      const matchingAccounts = await Account.find({
        $or: [{ firstName: regex }, { lastName: regex }, { uniqueId: regex }],
      }).select("_id");

      if (matchingAccounts.length) {
        orConditions.push({
          account: { $in: matchingAccounts.map((account) => account._id) },
        });
      }

      filters.$or = orConditions;
    }

    const [totalCount, auditLogs] = await Promise.all([
      AuditLog.countDocuments(filters),
      AuditLog.find(filters)
        .populate("account", "firstName lastName uniqueId mobileNo")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
    ]);

    sendSuccess(res, 200, "Audit logs fetched successfully", {
      data: auditLogs,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: safeLimit,
        totalPages: Math.ceil(totalCount / safeLimit),
      },
      appliedFilters: {
        search: search?.trim() ?? "",
        source: normalizedSource ?? "",
        outcome: normalizedOutcome ?? "",
        accountManagerId: requestedAccountManagerId ?? "",
        startDate: rawStartDate ?? "",
        endDate: rawEndDate ?? "",
      },
    });
  } catch (error: unknown) {
    console.error("getAuditLogs:", error);
    sendError(res, 500, "Failed to fetch audit logs");
  }
};

import { Response } from "express";
import Settings from "../models/settings.model";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendError, sendSuccess } from "../utils/apiResponse";

const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({ dailyCallTarget: 250 });
  }
  return settings;
};

export const getSettings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const settings = await getOrCreateSettings();

    sendSuccess(res, 200, "Settings fetched successfully", {
      dailyCallTarget: settings.dailyCallTarget,
    });
  } catch (error: unknown) {
    console.error("getSettings:", error);
    sendError(res, 500, "Failed to fetch settings");
  }
};

export const updateSettings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.sub) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const { dailyCallTarget } = req.body as { dailyCallTarget?: number };

    if (dailyCallTarget === undefined || dailyCallTarget === null) {
      sendError(res, 400, "dailyCallTarget is required");
      return;
    }

    if (!Number.isInteger(dailyCallTarget) || dailyCallTarget < 1) {
      sendError(res, 400, "dailyCallTarget must be a positive integer");
      return;
    }

    const settings = await getOrCreateSettings();
    settings.dailyCallTarget = dailyCallTarget;
    await settings.save();

    sendSuccess(res, 200, "Settings updated successfully", {
      dailyCallTarget: settings.dailyCallTarget,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ValidationError") {
      sendError(res, 400, error.message);
      return;
    }
    console.error("updateSettings:", error);
    sendError(res, 500, "Failed to update settings");
  }
};

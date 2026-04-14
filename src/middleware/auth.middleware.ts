import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/apiResponse";
import LoginMapping, {
  AccountStatus,
  LoginRole,
} from "../models/loginmapping.model";

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: LoginRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

const getBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.substring(7).trim() || null;
};

export const verifyAccessToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    sendError(res, 401, "Access token is required");
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    sendError(res, 500, "Server configuration error");
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AccessTokenPayload;

    const loginMapping = await LoginMapping.findOne({
      email: payload.email,
      role: payload.role,
    });

    if (!loginMapping) {
      sendError(res, 401, "Account not found for this token");
      return;
    }

    if (loginMapping.status !== AccountStatus.ACTIVE) {
      sendError(res, 403, "Your account is inactive. Please contact admin.");
      return;
    }

    req.user = payload;
    next();
  } catch {
    sendError(res, 401, "Invalid or expired access token");
  }
};

export const requireRole =
  (...allowedRoles: LoginRole[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, 403, "You are not allowed to access this resource");
      return;
    }

    next();
  };

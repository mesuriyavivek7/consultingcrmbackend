import { Response } from "express";

export const sendSuccess = <T>(
  res: Response,
  status: number,
  message: string,
  data: T
): void => {
  res.status(status).json({ message, data, success: true });
};

export const sendError = (
  res: Response,
  status: number,
  message: string
): void => {
  res.status(status).json({ message, success: false });
};

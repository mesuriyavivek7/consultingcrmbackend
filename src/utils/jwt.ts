import jwt, { type SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as NonNullable<
    SignOptions["expiresIn"]
  >;
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, secret, options);
};

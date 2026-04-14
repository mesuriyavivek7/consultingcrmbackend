import { Schema, model, Document } from "mongoose";

export enum LoginRole {
  ADMIN = "ADMIN",
  ACCOUNT = "ACCOUNT",
}

export enum AccountStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export interface ILoginMapping extends Document {
  email: string;
  password: string;
  role: LoginRole;
  status: AccountStatus;
}

const loginMappingSchema = new Schema<ILoginMapping>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(LoginRole),
      required: [true, "Role is required"],
    },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      required: [true, "Status is required"],
      default: AccountStatus.ACTIVE,
    },
  },
  { timestamps: true }
);

const LoginMapping = model<ILoginMapping>("LoginMapping", loginMappingSchema);

export default LoginMapping;

import { Schema, model, Document, Types } from "mongoose";

const generateSixDigitId = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

export interface IAccount extends Document {
  firstName: string;
  lastName: string;
  mobileNo: string;
  uniqueId: string;
  loginMapping: Types.ObjectId;
  createdBy: Types.ObjectId;
}

const accountSchema = new Schema<IAccount>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    mobileNo: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      match: [/^\d{10}$/, "Mobile number must be 10 digits"],
    },
    uniqueId: {
      type: String,
      unique: true,
      default: generateSixDigitId,
      match: [/^\d{6}$/, "Unique ID must be a 6 digit number"],
    },
    loginMapping: {
      type: Schema.Types.ObjectId,
      ref: "LoginMapping",
      required: true,
      unique: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Created by admin is required"],
    },
  },
  { timestamps: true }
);

const Account = model<IAccount>("Account", accountSchema);

export default Account;

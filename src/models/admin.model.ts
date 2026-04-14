import { Schema, model, Document, Types } from "mongoose";

export interface IAdmin extends Document {
  firstName: string;
  lastName: string;
  mobileNo: string;
  loginMapping: Types.ObjectId;
}

const adminSchema = new Schema<IAdmin>(
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
    loginMapping: {
      type: Schema.Types.ObjectId,
      ref: "LoginMapping",
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const Admin = model<IAdmin>("Admin", adminSchema);

export default Admin;

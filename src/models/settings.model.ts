import { Schema, model, Document } from "mongoose";

export interface ISettings extends Document {
  dailyCallTarget: number;
}

const settingsSchema = new Schema<ISettings>(
  {
    dailyCallTarget: {
      type: Number,
      required: [true, "Daily call target is required"],
      min: [1, "Daily call target must be at least 1"],
      default: 250,
    },
  },
  { timestamps: true }
);

const Settings = model<ISettings>("Settings", settingsSchema);

export default Settings;

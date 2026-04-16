import { Document, Schema, Types, model } from "mongoose";

export enum CallType {
  INCOMING = "INCOMING",
  OUTGOING = "OUTGOING",
}

export interface ICallLog extends Document {
  to: string;
  calledBy: Types.ObjectId;
  callStart: Date;
  callEnd: Date;
  duration: number;
  callType: CallType;
}

const callLogSchema = new Schema<ICallLog>(
    {
      to: {
      type: String,
      required: true,
      set: (value: string) => {
      let num = value.replace(/\D/g, ""); // remove non-digits

      if (num.length === 10) {
        return `+91${num}`; // assume India
      }

      if (!value.startsWith("+")) {
        return `+${num}`;
      }

      return value;
     },
    },
    calledBy: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "Called by account manager is required"],
      index: true,
    },
    callStart: {
      type: Date,
      required: [true, "Call start is required"],
    },
    callEnd: {
      type: Date,
      required: [true, "Call end is required"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [0, "Duration cannot be negative"],
    },
    callType: {
      type: String,
      enum: Object.values(CallType),
      required: [true, "Call type is required"],
    },
  },
  { timestamps: true }
);

const CallLog = model<ICallLog>("CallLog", callLogSchema);

export default CallLog;

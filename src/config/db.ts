import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async (): Promise<void> => {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error("MONGO_URL is missing in environment variables");
  }

  await mongoose.connect(mongoUrl);
  console.log("MongoDB connected successfully");
};

export default connectDB;

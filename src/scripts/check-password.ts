import mongoose from "mongoose";
import dotenv from "dotenv";
import LoginMapping from "../models/loginmapping.model";
import { verifyPassword } from "../utils/password";

dotenv.config();

async function checkPassword() {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/consultingcrm";
    await mongoose.connect(mongoUrl);

    const email = "riya@example.com";
    const password = "secure";

    const loginMapping = await LoginMapping.findOne({ email });

    if (!loginMapping) {
      console.log(`❌ User ${email} not found`);
      await mongoose.disconnect();
      return;
    }

    console.log(`✅ Found user: ${email}`);
    console.log(`   Stored password hash: ${loginMapping.password}`);
    console.log(`   Attempting to verify password: "${password}"`);

    const isValid = verifyPassword(password, loginMapping.password);
    console.log(`   Password valid: ${isValid}`);

    if (!isValid) {
      console.log(`\n⚠️  Password "${password}" does not match the stored hash`);
      console.log(`   This could mean:`);
      console.log(`   1. The password is incorrect`);
      console.log(`   2. The password was hashed with a different algorithm`);
      console.log(`   3. The stored hash is corrupted`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkPassword();

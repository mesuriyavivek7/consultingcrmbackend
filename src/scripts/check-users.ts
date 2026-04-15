import mongoose from "mongoose";
import dotenv from "dotenv";
import LoginMapping from "../models/loginmapping.model";
import Admin from "../models/admin.model";
import Account from "../models/account.model";

dotenv.config();

async function checkUsers() {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/consultingcrm";
    console.log("Connecting to:", mongoUrl);

    await mongoose.connect(mongoUrl);
    console.log("✅ Connected to MongoDB\n");

    const loginMappings = await LoginMapping.find({}).select("email role status").lean();
    console.log(`Found ${loginMappings.length} login mappings:\n`);

    for (const mapping of loginMappings) {
      console.log(`📧 Email: ${mapping.email}`);
      console.log(`   Role: ${mapping.role}`);
      console.log(`   Status: ${mapping.status}`);

      if (mapping.role === "ADMIN") {
        const admin = await Admin.findOne({ loginMapping: mapping._id }).select("firstName lastName").lean();
        if (admin) {
          console.log(`   Name: ${admin.firstName} ${admin.lastName}`);
        }
      } else if (mapping.role === "ACCOUNT") {
        const account = await Account.findOne({ loginMapping: mapping._id }).select("firstName lastName").lean();
        if (account) {
          console.log(`   Name: ${account.firstName} ${account.lastName}`);
        }
      }
      console.log("");
    }

    await mongoose.disconnect();
    console.log("✅ Disconnected");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkUsers();

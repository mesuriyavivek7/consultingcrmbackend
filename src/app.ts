import express from "express";
import cors from "cors";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import callLogRoutes from "./routes/calllog.routes";
import accountRoutes from "./routes/account.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API running 🚀");
});

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/call-logs", callLogRoutes);
app.use("/api/v1/account", accountRoutes);

export default app;
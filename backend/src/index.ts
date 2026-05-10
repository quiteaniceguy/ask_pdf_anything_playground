import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireAuth } from "./middleware/auth.js";
import userRoutes from "./routes/user.js";
import type { AppVariables } from "./types.js";

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());
app.use("*", cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));

app.get("/health", (c) => c.json({ ok: true }));

app.use("/api/*", requireAuth);
app.route("/api/user", userRoutes);

const port = Number(process.env.PORT ?? 3001);
console.log(`Backend running on http://localhost:${port}`);

export default { port, fetch: app.fetch };

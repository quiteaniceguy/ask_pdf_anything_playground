import { createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await clerk.verifyToken(token);
    c.set("userId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

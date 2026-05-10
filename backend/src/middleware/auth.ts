import { createClient } from "@supabase/supabase-js";
import type { Context, Next } from "hono";
import type { AppVariables } from "../types.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function requireAuth(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    c.set("user", user);
    c.set("userId", user.id);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

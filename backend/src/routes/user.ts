import { Hono } from "hono";
import type { AppVariables } from "../types.js";

const router = new Hono<{ Variables: AppVariables }>();

router.get("/me", async (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    email: user.email,
    firstName: user.user_metadata?.first_name,
    lastName: user.user_metadata?.last_name,
    imageUrl: user.user_metadata?.avatar_url,
  });
});

export default router;

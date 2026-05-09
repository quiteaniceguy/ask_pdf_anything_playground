import { Hono } from "hono";
import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
const router = new Hono();

router.get("/me", async (c) => {
  const userId = c.get("userId") as string;
  const user = await clerk.users.getUser(userId);
  return c.json({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
  });
});

export default router;

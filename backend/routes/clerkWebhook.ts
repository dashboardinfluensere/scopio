import { Router } from "express";
import { Webhook } from "svix";
import { ensureClerkUserExists } from "../services/ensureClerkUser";

const router = Router();

router.post("/clerk", async (req, res) => {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(500).json({ error: "Missing webhook secret" });
    }

    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: "Missing svix headers" });
    }

    const wh = new Webhook(secret);

    const evt = wh.verify(JSON.stringify(req.body), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as any;

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const clerkUserId = evt.data?.id;

      if (!clerkUserId) {
        return res.status(400).json({ error: "Missing Clerk user id" });
      }

      await ensureClerkUserExists(clerkUserId);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(400).json({ error: "Webhook failed" });
  }
});

export default router;
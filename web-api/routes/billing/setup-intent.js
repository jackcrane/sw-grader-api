import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { createSetupIntentForUser } from "../../services/stripeCustomers.js";
import { getStripePublishableKey } from "../../util/stripe.js";

export const post = [
  withAuth,
  async (req, res) => {
    const userId = req.user?.localUserId ?? req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "missing_user" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    const setupIntent = await createSetupIntentForUser(user);
    const publishableKey = getStripePublishableKey();

    return res.json({
      clientSecret: setupIntent.client_secret,
      publishableKey,
      customerId: setupIntent.customer,
    });
  },
];

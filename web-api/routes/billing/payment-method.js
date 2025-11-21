import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { ensureStripeCustomerForUser } from "../../services/stripeCustomers.js";
import { getStripeClient } from "../../util/stripe.js";

const getUserFromRequest = async (req) => {
  const userId = req.user?.localUserId ?? req.user?.id;
  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: userId } });
};

const serializePaymentMethod = (paymentMethod) => {
  if (!paymentMethod || paymentMethod.object !== "payment_method") {
    return null;
  }

  const card = paymentMethod.card ?? {};

  return {
    id: paymentMethod.id,
    brand: card.brand ?? "",
    last4: card.last4 ?? "",
    expMonth: card.exp_month ?? null,
    expYear: card.exp_year ?? null,
  };
};

export const get = [
  withAuth,
  async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(400).json({ error: "missing_user" });
    }

    const stripe = getStripeClient();
    const { customerId } = await ensureStripeCustomerForUser(user);

    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });

    const paymentMethod = serializePaymentMethod(
      customer?.invoice_settings?.default_payment_method
    );

    return res.json({ paymentMethod });
  },
];

export const post = [
  withAuth,
  async (req, res) => {
    const paymentMethodId = req.body?.paymentMethodId;
    if (!paymentMethodId) {
      return res.status(400).json({ error: "missing_payment_method" });
    }

    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(400).json({ error: "missing_user" });
    }

    const stripe = getStripeClient();
    const { customerId } = await ensureStripeCustomerForUser(user);

    const paymentMethod = await stripe.paymentMethods.retrieve(
      paymentMethodId
    );
    if (!paymentMethod || paymentMethod.object !== "payment_method") {
      return res.status(404).json({ error: "payment_method_not_found" });
    }

    if (
      paymentMethod.customer &&
      paymentMethod.customer !== customerId
    ) {
      return res.status(400).json({ error: "payment_method_in_use" });
    }

    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    return res.json({
      paymentMethod: serializePaymentMethod(paymentMethod),
    });
  },
];

import { PaypalCalculator } from "@/components/paypal-calculator";
import { getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "PayPal currency" };

export default async function PaypalPage() {
  const { db, user } = await requireUser();
  const settings = await getSettings(db, user.id);
  return <PaypalCalculator defaultHome={settings.default_currency} />;
}

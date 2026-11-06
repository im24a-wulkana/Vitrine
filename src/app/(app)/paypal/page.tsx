import { PaypalCalculator } from "@/components/paypal-calculator";
import { requireUser } from "@/lib/session";

export const metadata = { title: "PayPal currency" };

export default async function PaypalPage() {
  await requireUser();
  return <PaypalCalculator />;
}

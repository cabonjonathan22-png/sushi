"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { euros } from "@/lib/money";

/** Paiement Stripe (CB, Apple Pay, Google Pay) affiché dans la page, sans redirection si possible. */
export function StripePay({ publishableKey, clientSecret, amountCents, returnUrl, onPaid }: {
  publishableKey: string;
  clientSecret: string;
  amountCents: number;
  returnUrl: string;
  onPaid: () => void;
}) {
  const { locale } = useI18n();
  const stripePromise = useMemo<Promise<Stripe | null>>(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{
      clientSecret, locale: locale as "fr",
      appearance: { theme: "stripe", variables: { colorPrimary: "#d9441b", borderRadius: "12px", fontSizeBase: "16px" } },
    }}>
      <PayForm amountCents={amountCents} returnUrl={returnUrl} onPaid={onPaid} />
    </Elements>
  );
}

function PayForm({ amountCents, returnUrl, onPaid }: { amountCents: number; returnUrl: string; onPaid: () => void }) {
  const { t } = useI18n();
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError("");
        const { error: err, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
        if (err) {
          setError(err.message ?? t("stripe.failed"));
          setBusy(false);
        } else if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) onPaid();
        else setBusy(false);
      }}
    >
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      <button type="submit" disabled={!stripe || busy} className="btn-primary mt-4 w-full text-lg">
        {busy ? t("stripe.paying") : t("stripe.pay", { amount: euros(amountCents) })}
      </button>
      <p className="mt-2 text-center text-xs text-neutral-600">{t("stripe.secure")}</p>
    </form>
  );
}

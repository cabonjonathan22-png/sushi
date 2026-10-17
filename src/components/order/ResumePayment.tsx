"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { StripePay } from "./StripePay";

/** Reprise d'un paiement en ligne interrompu (onglet fermé, carte refusée…). */
export function ResumePayment({ token, amountCents }: { token: string; amountCents: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/orders/${token}/payment`, { method: "POST" })
      .then(async (r) => {
        const d = (await r.json()) as { clientSecret?: string; publishableKey?: string; error?: string; paid?: boolean };
        if (d.paid) router.refresh();
        else if (d.clientSecret && d.publishableKey) setData({ clientSecret: d.clientSecret, publishableKey: d.publishableKey });
        else setError(t("stripe.unavailable"));
      })
      .catch(() => setError(t("stripe.network")));
  }, [token, router]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="font-semibold text-red-800">{error}</p>;
  if (!data) return <p aria-busy="true">{t("stripe.loading")}</p>;
  return (
    <StripePay publishableKey={data.publishableKey} clientSecret={data.clientSecret} amountCents={amountCents}
      returnUrl={`${window.location.origin}/commande/${token}?nouvelle=1`} onPaid={() => router.refresh()} />
  );
}

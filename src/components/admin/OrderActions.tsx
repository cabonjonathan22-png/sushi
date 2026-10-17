"use client";

import { useState, useTransition } from "react";
import { cancelAction, markPaid, refundAction, reprint, setOrderStatus } from "@/app/admin/(panel)/commandes/actions";
import { STATUS_LABELS } from "@/lib/catalog-constants";
import type { OrderStatus } from "@/lib/order-status";
import { ActionForm, SubmitButton } from "./forms";
import { printTicket } from "./live";

export function OrderActions({
  orderId, transitions, canUpdate, canPay, canRefund, unpaid, refundableCents, paper, copies,
}: {
  orderId: string;
  transitions: OrderStatus[];
  canUpdate: boolean;
  canPay: boolean;
  canRefund: boolean;
  unpaid: boolean;
  refundableCents: number;
  paper: string;
  copies: number;
}) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | undefined>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: string; error?: string } | undefined>) => start(async () => setMsg(await fn()));
  const forward = transitions.filter((t) => t !== "CANCELLED");

  return (
    <div className="space-y-5">
      {msg?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 font-semibold text-red-800">{msg.error}</p>}
      {msg?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 font-semibold text-green-800">{msg.ok}</p>}

      {canUpdate && forward.length > 0 && (
        <div>
          <p className="label">Changer le statut</p>
          <div className="flex flex-wrap gap-2">
            {forward.map((t, i) => (
              <button key={t} type="button" disabled={pending} onClick={() => run(() => setOrderStatus(orderId, t))} className={i === 0 ? "btn-primary text-lg" : "btn-ghost"}>
                {STATUS_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="label">Ticket</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-dark" onClick={() => printTicket(orderId, { paper, copies })}>🖨️ Imprimer ici</button>
          <a className="btn-ghost" href={`/admin/commandes/${orderId}/ticket?papier=${paper}&copies=${copies}`} target="_blank" rel="noopener">Aperçu</a>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => reprint(orderId))}>Renvoyer aux imprimantes réseau</button>
        </div>
      </div>

      {canPay && unpaid && (
        <div>
          <p className="label">Règlement reçu (au retrait / à la livraison)</p>
          <div className="flex flex-wrap gap-2">
            {([["CASH", "Espèces"], ["CARD_TERMINAL", "CB (TPE)"], ["MEAL_VOUCHER_PAPER", "Titres-restaurant papier"], ["MEAL_VOUCHER_CARD", "Titres-restaurant carte"]] as const).map(([m, label]) => (
              <button key={m} type="button" disabled={pending} className="btn-ghost" onClick={() => window.confirm(`Confirmer le règlement : ${label} ?`) && run(() => markPaid(orderId, m))}>{label}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-600">Information de suivi. L'encaissement se fait sur la caisse enregistreuse du restaurant.</p>
        </div>
      )}

      {canUpdate && transitions.includes("CANCELLED") && (
        <details className="rounded-xl border border-red-200 p-4">
          <summary className="cursor-pointer font-semibold text-red-800">Annuler la commande</summary>
          <ActionForm action={cancelAction} className="mt-3 grid gap-2" confirm="Annuler définitivement cette commande ?">
            <input type="hidden" name="orderId" value={orderId} />
            <label className="label" htmlFor="reason">Motif (envoyé au client)</label>
            <input id="reason" name="reason" required className="input" placeholder="Rupture de stock, fermeture exceptionnelle…" />
            <SubmitButton className="btn-danger">Annuler la commande</SubmitButton>
          </ActionForm>
        </details>
      )}

      {canRefund && refundableCents > 0 && (
        <details className="rounded-xl border border-neutral-200 p-4">
          <summary className="cursor-pointer font-semibold">Rembourser (total ou partiel)</summary>
          <ActionForm action={refundAction} className="mt-3 grid gap-2" confirm="Confirmer le remboursement ? Un avoir numéroté sera créé.">
            <input type="hidden" name="orderId" value={orderId} />
            <label className="label" htmlFor="amount">Montant (max {(refundableCents / 100).toFixed(2).replace(".", ",")} €)</label>
            <input id="amount" name="amount" required inputMode="decimal" className="input" defaultValue={(refundableCents / 100).toFixed(2).replace(".", ",")} />
            <label className="label" htmlFor="rreason">Motif</label>
            <input id="rreason" name="reason" required className="input" placeholder="Produit manquant, erreur…" />
            <SubmitButton className="btn-dark">Rembourser</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

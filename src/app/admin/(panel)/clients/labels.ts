import type { ClientKind } from "@/lib/customers-admin";

/** Libellé et couleur du type de client (liste et fiche). */
export const KIND_LABEL: Record<ClientKind, { label: string; cls: string }> = {
  ACCOUNT: { label: "Compte client", cls: "bg-green-100 text-green-800" },
  TO_ACTIVATE: { label: "Compte à activer", cls: "bg-amber-100 text-amber-900" },
  GUEST: { label: "Sans compte", cls: "bg-neutral-200 text-neutral-700" },
};

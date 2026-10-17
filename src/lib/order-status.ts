/**
 * Cycle de vie d'une commande :
 * Nouvelle → Acceptée → En préparation → Prête / En livraison → Terminée (ou Annulée).
 * « En attente de paiement » ne concerne que le paiement en ligne non confirmé.
 */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "CANCELLED";

export type Mode = "PICKUP" | "DELIVERY" | "DINE_IN";

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["NEW", "CANCELLED"],
  NEW: ["ACCEPTED", "PREPARING", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY", "OUT_FOR_DELIVERY", "CANCELLED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Transitions autorisées, filtrées selon le mode (« En livraison » seulement en livraison). */
export function allowedTransitions(from: OrderStatus, mode: Mode): OrderStatus[] {
  return NEXT[from].filter((to) => to !== "OUT_FOR_DELIVERY" || mode === "DELIVERY");
}

export function canTransition(from: OrderStatus, to: OrderStatus, mode: Mode): boolean {
  return allowedTransitions(from, mode).includes(to);
}

/** Étape « suivante » proposée en gros bouton sur l'écran des commandes. */
export function primaryNext(from: OrderStatus, mode: Mode): OrderStatus | null {
  switch (from) {
    case "NEW":
      return "ACCEPTED";
    case "ACCEPTED":
      return "PREPARING";
    case "PREPARING":
      return mode === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY";
    case "READY":
      return mode === "DELIVERY" ? "OUT_FOR_DELIVERY" : "COMPLETED";
    case "OUT_FOR_DELIVERY":
      return "COMPLETED";
    default:
      return null;
  }
}

/** Statuts visibles sur l'écran « Commandes en cours » et en cuisine. */
export const ACTIVE_STATUSES: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

/** Changements de statut qui déclenchent un e-mail au client. */
export const CUSTOMER_NOTIFIED: OrderStatus[] = ["ACCEPTED", "READY", "OUT_FOR_DELIVERY", "CANCELLED"];

import "server-only";
import { audit } from "./audit";
import { readConfig } from "./config";
import { db, type Tx } from "./db";
import { pointsFor, type RewardRule } from "./loyalty-rules";

/**
 * Carte de fidélité : grand livre des points (LoyaltyTransaction).
 *  - points gagnés quand la commande est remise (statut « Terminée »), sur le montant payé hors livraison ;
 *  - points dépensés à la commande (récompense), rendus si la commande est annulée ;
 *  - points gagnés retirés si la commande est annulée ou remboursée (au prorata) ;
 *  - bonus de bienvenue, corrections manuelles (back-office), expiration après inactivité.
 * Les commandes importées de l'ancien site ne rapportent pas de points.
 */

type Client = Tx | typeof db;

export async function loyaltySettings() {
  return (await readConfig()).loyalty;
}

export async function balanceOf(customerId: string, tx: Client = db): Promise<number> {
  const r = await tx.loyaltyTransaction.aggregate({ where: { customerId }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

export function toRule(r: { id: string; name: string; type: RewardRule["type"]; value: number; productId: string | null; pointsCost: number; minSubtotalCents: number; active: boolean }): RewardRule {
  return { id: r.id, name: r.name, type: r.type, value: r.value, productId: r.productId, pointsCost: r.pointsCost, minSubtotalCents: r.minSubtotalCents, active: r.active };
}

export async function activeRewards() {
  return db.loyaltyReward.findMany({ where: { active: true }, orderBy: [{ pointsCost: "asc" }, { sortOrder: "asc" }], include: { product: { select: { name: true } } } });
}

/** Verrou par client : deux commandes simultanées ne dépensent jamais deux fois les mêmes points. */
export async function lockCustomer(tx: Tx, customerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"loyalty:" + customerId}))`;
}

interface OrderForLoyalty {
  id: string;
  customerId: string | null;
  source: string;
  totalCents: number;
  deliveryFeeCents: number;
  loyaltyPointsSpent: number;
  loyaltyRewardId: string | null;
  reference: string;
}

/** Appelé à chaque changement de statut (dans la même transaction). */
export async function onLoyaltyStatus(tx: Tx, order: OrderForLoyalty, to: string): Promise<void> {
  if (!order.customerId || order.source === "IMPORT_WP") return;
  const existing = await tx.loyaltyTransaction.findMany({ where: { orderId: order.id }, select: { kind: true, points: true } });
  const sum = (kind: string) => existing.filter((t) => t.kind === kind).reduce((a, t) => a + t.points, 0);

  if (to === "COMPLETED") {
    const settings = await loyaltySettings();
    if (!settings.enabled || existing.some((t) => t.kind === "EARN")) return;
    const points = pointsFor(order.totalCents - order.deliveryFeeCents, settings.pointsPerEuro);
    if (points > 0) await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, kind: "EARN", points, orderId: order.id, note: `Commande ${order.reference}` } });
  }

  if (to === "CANCELLED") {
    // Récompense utilisée : points rendus. Points déjà gagnés : retirés.
    if (order.loyaltyPointsSpent > 0 && !existing.some((t) => t.kind === "REFUND_REDEEM")) {
      await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, kind: "REFUND_REDEEM", points: order.loyaltyPointsSpent, orderId: order.id, rewardId: order.loyaltyRewardId, note: `Commande ${order.reference} annulée` } });
    }
    const remaining = sum("EARN") + sum("REVERSE_EARN");
    if (remaining > 0) await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, kind: "REVERSE_EARN", points: -remaining, orderId: order.id, note: `Commande ${order.reference} annulée` } });
  }
}

/** Remboursement (avoir) : retire les points gagnés au prorata du montant remboursé. */
export async function onLoyaltyRefund(tx: Tx, order: OrderForLoyalty, refundedTotalCents: number): Promise<void> {
  if (!order.customerId) return;
  const existing = await tx.loyaltyTransaction.findMany({ where: { orderId: order.id }, select: { kind: true, points: true } });
  const earned = existing.filter((t) => t.kind === "EARN").reduce((a, t) => a + t.points, 0);
  const reversed = -existing.filter((t) => t.kind === "REVERSE_EARN").reduce((a, t) => a + t.points, 0);
  if (!earned || !order.totalCents) return;
  const shouldReverse = Math.min(earned, Math.ceil((earned * refundedTotalCents) / order.totalCents));
  const delta = shouldReverse - reversed;
  if (delta > 0) await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, kind: "REVERSE_EARN", points: -delta, orderId: order.id, note: `Avoir sur la commande ${order.reference}` } });
}

/**
 * Commandes passées sans compte puis rattachées au compte (même e-mail) : points crédités
 * pour celles déjà remises. Bonus de bienvenue s'il est prévu et pas encore versé.
 */
export async function creditCustomer(customerId: string): Promise<number> {
  const settings = await loyaltySettings();
  if (!settings.enabled) return 0;
  return db.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    let credited = 0;
    const orders = await tx.order.findMany({
      where: { customerId, status: "COMPLETED", source: { not: "IMPORT_WP" }, loyalty: { none: { kind: "EARN" } } },
      select: { id: true, reference: true, totalCents: true, deliveryFeeCents: true },
    });
    for (const o of orders) {
      const points = pointsFor(o.totalCents - o.deliveryFeeCents, settings.pointsPerEuro);
      if (points <= 0) continue;
      await tx.loyaltyTransaction.create({ data: { customerId, kind: "EARN", points, orderId: o.id, note: `Commande ${o.reference}` } });
      credited += points;
    }
    if (settings.signupBonus > 0 && !(await tx.loyaltyTransaction.count({ where: { customerId, kind: "BONUS" } }))) {
      await tx.loyaltyTransaction.create({ data: { customerId, kind: "BONUS", points: settings.signupBonus, note: "Bienvenue" } });
      credited += settings.signupBonus;
    }
    return credited;
  });
}

/** Correction manuelle depuis le back-office (tracée au journal). Le solde ne devient jamais négatif. */
export async function adjustPoints(customerId: string, points: number, note: string, staff: { userId: string; label: string }) {
  return db.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const balance = await balanceOf(customerId, tx);
    if (balance + points < 0) throw new Error(`Solde insuffisant : ${balance} point(s).`);
    await tx.loyaltyTransaction.create({ data: { customerId, kind: "ADJUST", points, note: note.slice(0, 200), createdById: staff.userId } });
    await audit({ userId: staff.userId, actor: staff.label, action: "loyalty.adjust", entityType: "Customer", entityId: customerId, data: { points, note } }, tx);
    return balance + points;
  });
}

/** Expiration : solde remis à zéro après N mois sans commande ni utilisation de points. */
export async function expireInactivePoints(): Promise<number> {
  const settings = await loyaltySettings();
  if (!settings.enabled || settings.expiryMonths <= 0) return 0;
  const limit = new Date();
  limit.setMonth(limit.getMonth() - settings.expiryMonths);
  const rows = await db.$queryRaw<{ customerId: string; balance: bigint }[]>`
    SELECT "customerId", SUM(points) AS balance FROM "LoyaltyTransaction"
    GROUP BY "customerId"
    HAVING SUM(points) > 0 AND MAX(CASE WHEN kind IN ('EARN', 'REDEEM', 'BONUS', 'ADJUST') THEN "createdAt" END) < ${limit}`;
  for (const r of rows) {
    await db.loyaltyTransaction.create({ data: { customerId: r.customerId, kind: "EXPIRE", points: -Number(r.balance), note: `Inactivité de plus de ${settings.expiryMonths} mois` } });
  }
  return rows.length;
}

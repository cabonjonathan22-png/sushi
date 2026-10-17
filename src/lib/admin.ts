import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { audit } from "./audit";
import { clientIp, requireStaff, type StaffContext } from "./auth/session";
import { db } from "./db";
import { can, restaurantScope, type Permission } from "./permissions";

export const ADMIN_RESTAURANT_COOKIE = "ys_admin_r";

/**
 * Contexte du back-office : utilisateur, restaurants auxquels il a accès et
 * restaurant sélectionné (mémorisé dans un cookie). Vérifie la permission demandée
 * sur le restaurant sélectionné.
 */
export const adminContext = cache(async (permission?: Permission) => {
  const staff = await requireStaff();
  const restaurants = await db.restaurant.findMany({
    where: restaurantScope(staff.actor),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, ordersPausedUntil: true, ordersPausedReason: true, active: true },
  });
  const wanted = (await cookies()).get(ADMIN_RESTAURANT_COOKIE)?.value;
  const current = restaurants.find((r) => r.id === wanted) ?? restaurants[0] ?? null;
  if (permission && !can(staff.actor, permission, current?.id)) redirect("/admin/acces-refuse");
  return { staff, restaurants, current };
});

/** Restaurant sélectionné obligatoire (sinon : page d'accueil du back-office). */
export async function adminRestaurant(permission: Permission) {
  const ctx = await adminContext(permission);
  if (!ctx.current) redirect("/admin?erreur=aucun-restaurant");
  return { ...ctx, current: ctx.current };
}

/** Vérification dans une action serveur : droit + périmètre du restaurant concerné. */
export async function authorize(permission: Permission, restaurantId?: string): Promise<StaffContext> {
  const staff = await requireStaff();
  if (!can(staff.actor, permission, restaurantId)) throw new Error("Action non autorisée.");
  return staff;
}

export function actorOf(staff: StaffContext, ip?: string) {
  return { userId: staff.user.id, label: staff.label, ip };
}

/** Écrit une action du back-office dans le journal (auteur, IP, restaurant). */
export async function logAction(
  staff: StaffContext,
  action: string,
  entityType: string,
  entityId: string,
  restaurantId: string | null,
  data: Record<string, unknown> = {},
) {
  await audit({ userId: staff.user.id, actor: staff.label, action, entityType, entityId, restaurantId, data, ip: await clientIp() });
}

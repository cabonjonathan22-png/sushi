import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "../crypto";
import { db } from "../db";
import { ipFromHeaders } from "../http";
import { can, REQUIRES_2FA, type Actor, type Permission, type Role } from "../permissions";

/**
 * Sessions en base, jeton aléatoire dans un cookie httpOnly / SameSite=Lax / Secure (prod).
 * Seule l'empreinte sha256 du jeton est stockée : une fuite de la base ne permet pas
 * de se connecter.
 */

const STAFF_COOKIE = "ys_staff";
const CUSTOMER_COOKIE = "ys_client";
const STAFF_TTL_H = 12; // super-admin / propriétaire
const STAFF_DEVICE_TTL_H = 24 * 14; // gérants / employés (tablette du comptoir)
const CUSTOMER_TTL_H = 24 * 60;

const secure = () => process.env.NODE_ENV === "production";

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

async function createSession(kind: "staff" | "customer", ids: { userId?: string; customerId?: string }, ttlHours: number, pending2fa = false) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  const h = await headers();
  await db.session.create({
    data: {
      id: sha256(token), ...ids, pending2fa, expiresAt,
      ip: await clientIp(), userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    },
  });
  (await cookies()).set(kind === "staff" ? STAFF_COOKIE : CUSTOMER_COOKIE, token, {
    httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export function staffTtl(role: Role): number {
  return REQUIRES_2FA.includes(role) ? STAFF_TTL_H : STAFF_DEVICE_TTL_H;
}

export async function startStaffSession(userId: string, role: Role, pending2fa: boolean) {
  await createSession("staff", { userId }, staffTtl(role), pending2fa);
}

/** Tablette du restaurant (appairée par code) : reste connectée un an. */
export async function startDeviceSession(userId: string) {
  await createSession("staff", { userId }, 24 * 365);
}

export async function startCustomerSession(customerId: string) {
  await createSession("customer", { customerId }, CUSTOMER_TTL_H);
}

async function readSession(cookieName: string) {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) } });
  if (!s || s.expiresAt < new Date()) return null;
  return s;
}

export async function endStaffSession() {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  (await cookies()).delete(STAFF_COOKIE);
}

export async function endCustomerSession() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  (await cookies()).delete(CUSTOMER_COOKIE);
}

/** Valide le second facteur de la session courante. */
export async function completeStaff2fa() {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (token) await db.session.update({ where: { id: sha256(token) }, data: { pending2fa: false } });
}

export interface StaffContext {
  sessionPending2fa: boolean;
  user: { id: string; email: string; name: string; role: Role; totpEnabled: boolean };
  actor: Actor;
  /** Libellé pour le journal : « Marie (Gérant) ». */
  label: string;
}

/** Utilisateur connecté (ou null), mis en cache pour la requête. */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const s = await readSession(STAFF_COOKIE);
  if (!s?.userId) return null;
  const user = await db.user.findUnique({
    where: { id: s.userId },
    include: { restaurants: { select: { restaurantId: true } } },
  });
  if (!user || !user.active) return null;
  return {
    sessionPending2fa: s.pending2fa,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, totpEnabled: user.totpEnabled },
    actor: { id: user.id, role: user.role, restaurantIds: user.restaurants.map((r) => r.restaurantId) },
    label: user.name,
  };
});

/**
 * À appeler en tête de chaque page / action du back-office.
 * Redirige vers la connexion, la 2FA ou la page « accès refusé ».
 */
export async function requireStaff(permission?: Permission, restaurantId?: string): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/connexion");
  if (ctx.sessionPending2fa) redirect("/admin/connexion/code");
  if (REQUIRES_2FA.includes(ctx.user.role) && !ctx.user.totpEnabled) redirect("/admin/securite");
  if (permission && !can(ctx.actor, permission, restaurantId)) redirect("/admin/acces-refuse");
  return ctx;
}

/** Variante pour les pages de configuration 2FA (n'exige pas la 2FA déjà active). */
export async function requireStaffNo2faCheck(): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/connexion");
  if (ctx.sessionPending2fa) redirect("/admin/connexion/code");
  return ctx;
}

export const getCustomer = cache(async () => {
  const s = await readSession(CUSTOMER_COOKIE);
  if (!s?.customerId) return null;
  const c = await db.customer.findUnique({ where: { id: s.customerId }, include: { addresses: true } });
  return c && !c.anonymizedAt ? c : null;
});

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_RESTAURANT_COOKIE } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { startDeviceSession } from "@/lib/auth/session";
import { ipFromHeaders } from "@/lib/http";
import { createTabletUser, findPairingCode } from "@/lib/pairing";
import { rateLimit } from "@/lib/rate-limit";

export type InstallState = { error?: string; download?: string } | undefined;

/** Code saisi sur l'appareil du restaurant : tablette connectée, ou poste d'impression à télécharger. */
export async function installAction(_: InstallState, form: FormData): Promise<InstallState> {
  const ip = ipFromHeaders(await headers());
  if (!(await rateLimit(`pairing:${ip}`, 10, 600))) return { error: "Trop d'essais. Patientez 10 minutes." };
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const p = await findPairingCode(code);
  if (!p) return { error: "Code inconnu ou expiré. Demandez un nouveau code (valable 30 minutes)." };

  if (p.purpose === "PRINTER") return { download: `/api/print/installer?code=${code}` };

  const user = await createTabletUser(p.restaurantId, p.id);
  await audit({ userId: user.id, actor: user.name, action: "device.paired", entityType: "User", entityId: user.id, restaurantId: p.restaurantId, data: { createdBy: p.createdById }, ip });
  await startDeviceSession(user.id);
  (await cookies()).set(ADMIN_RESTAURANT_COOKIE, p.restaurantId, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.NODE_ENV === "production", maxAge: 31536000 });
  redirect("/admin/commandes?tablette=1");
}

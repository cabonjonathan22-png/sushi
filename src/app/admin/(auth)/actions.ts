"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { hashPassword, lockoutAfterFailure, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clientIp, completeStaff2fa, endStaffSession, getStaff, requireStaffNo2faCheck, startStaffSession } from "@/lib/auth/session";
import { newTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { REQUIRES_2FA } from "@/lib/permissions";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export type FormState = { error?: string; ok?: string } | undefined;

const GENERIC = "E-mail ou mot de passe incorrect.";
/** Hachage factice : un e-mail inconnu prend le même temps qu'un mauvais mot de passe. */
let dummyHash: Promise<string> | null = null;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}`, LIMITS.login.limit, LIMITS.login.window))) {
    return { error: "Trop de tentatives depuis cet appareil. Réessayez dans 15 minutes." };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await verifyPassword(await (dummyHash ??= hashPassword("compte-inexistant")), password);
    return { error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: `Compte verrouillé après plusieurs échecs. Réessayez après ${user.lockedUntil.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}.` };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: lockoutAfterFailure(failed) } });
    await audit({ userId: user.id, actor: user.name, action: "auth.failed", entityType: "User", entityId: user.id, ip, data: { failed } });
    return { error: GENERIC };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await startStaffSession(user.id, user.role, user.totpEnabled);
  await audit({ userId: user.id, actor: user.name, action: "auth.login", entityType: "User", entityId: user.id, ip });
  redirect(user.totpEnabled ? "/admin/connexion/code" : REQUIRES_2FA.includes(user.role) ? "/admin/securite" : "/admin");
}

export async function verifyCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/connexion");
  const ip = await clientIp();
  if (!(await rateLimit(`totp:${ctx.user.id}`, 8, 900))) return { error: "Trop de codes erronés. Patientez 15 minutes." };
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), String(form.get("code") ?? ""))) {
    await audit({ userId: user.id, actor: user.name, action: "auth.2fa_failed", entityType: "User", entityId: user.id, ip });
    return { error: "Code incorrect. Vérifiez l'heure de votre téléphone." };
  }
  await completeStaff2fa();
  redirect("/admin");
}

/** Étape 1 de l'activation 2FA : génère un secret (stocké chiffré, pas encore actif). */
export async function start2faAction(): Promise<void> {
  const ctx = await requireStaffNo2faCheck();
  await db.user.update({ where: { id: ctx.user.id }, data: { totpSecretEnc: encryptSecret(newTotpSecret()), totpEnabled: false } });
  redirect("/admin/securite?etape=scan");
}

/** Étape 2 : le premier code valide active la 2FA. */
export async function confirm2faAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireStaffNo2faCheck();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.totpSecretEnc) return { error: "Recommencez l'activation." };
  if (!verifyTotp(decryptSecret(user.totpSecretEnc), String(form.get("code") ?? ""))) return { error: "Code incorrect, réessayez." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await audit({ userId: user.id, actor: user.name, action: "auth.2fa_enabled", entityType: "User", entityId: user.id, ip: await clientIp() });
  redirect("/admin?ok=2fa");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireStaffNo2faCheck();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "Les deux nouveaux mots de passe ne correspondent pas." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(user.passwordHash, current))) return { error: "Mot de passe actuel incorrect." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  // Déconnecte les autres appareils.
  await db.session.deleteMany({ where: { userId: user.id, createdAt: { lt: new Date(Date.now() - 1000) } } });
  await startStaffSession(user.id, user.role, false);
  await audit({ userId: user.id, actor: user.name, action: "auth.password_changed", entityType: "User", entityId: user.id, ip: await clientIp() });
  return { ok: "Mot de passe modifié. Les autres appareils ont été déconnectés." };
}

export async function logoutAction(): Promise<void> {
  await endStaffSession();
  redirect("/admin/connexion");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { hashPassword, lockoutAfterFailure, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clientIp, endCustomerSession, getCustomer, startCustomerSession } from "@/lib/auth/session";
import { makeCustomerLink, readCustomerLink, verifyCustomerLink } from "@/lib/customer-token";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { passwordResetMail } from "@/lib/emails";
import { creditCustomer } from "@/lib/loyalty";
import { getSiteSettings } from "@/lib/restaurants";
import { sendMail } from "@/lib/mail";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/seo";

type Result = { ok?: string; error?: string } | undefined;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let dummy: Promise<string> | null = null;

/** Inscription OU mot de passe oublié : un lien est envoyé ; la réponse est identique dans tous les cas. */
export async function requestLinkAction(_: Result, form: FormData): Promise<Result> {
  const { t, locale } = await getI18n();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  if (!EMAIL.test(email)) return { error: t("account.err.email") };
  const ip = await clientIp();
  if (!(await rateLimit(`link:${ip}`, 5, 900)) || !(await rateLimit(`link:${email}`, 3, 900))) return { error: t("account.err.tooMany") };
  const customer = (await db.customer.findUnique({ where: { email } })) ?? (await db.customer.create({ data: { email } }));
  if (!customer.anonymizedAt) {
    const link = `${appUrl()}/compte/mot-de-passe?t=${makeCustomerLink(customer.id, customer.passwordHash)}`;
    await sendMail({ to: email, ...passwordResetMail(link, { t, locale, brand: (await getSiteSettings()).brandName }) });
  }
  return { ok: t("account.linkSent") };
}

export async function setPasswordAction(_: Result, form: FormData): Promise<Result> {
  const token = String(form.get("t") ?? "");
  const password = String(form.get("password") ?? "");
  const { t: tr } = await getI18n();
  if (password !== String(form.get("confirm") ?? "")) return { error: tr("account.err.mismatch") };
  if (passwordProblem(password)) return { error: tr(password.length < 10 ? "account.err.short" : "account.err.weak") };
  const t = readCustomerLink(token);
  const customer = t ? await db.customer.findUnique({ where: { id: t.customerId } }) : null;
  if (!customer || customer.anonymizedAt || !verifyCustomerLink(token, customer.passwordHash)) return { error: tr("account.err.link") };
  await db.$transaction([
    db.customer.update({ where: { id: customer.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } }),
    // L'adresse est prouvée : on rattache les commandes passées sans compte avec cet e-mail.
    db.order.updateMany({ where: { customerEmail: customer.email, customerId: null }, data: { customerId: customer.id } }),
    db.session.deleteMany({ where: { customerId: customer.id } }),
  ]);
  await creditCustomer(customer.id).catch((e) => console.error("[fidélité]", e));
  await startCustomerSession(customer.id);
  redirect("/compte");
}

export async function customerLoginAction(_: Result, form: FormData): Promise<Result> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!(await rateLimit(`clogin:${await clientIp()}`, LIMITS.login.limit, LIMITS.login.window))) return { error: (await getI18n()).t("account.err.tooManyLogins") };
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || !c.passwordHash || c.anonymizedAt) {
    await verifyPassword(await (dummy ??= hashPassword("client-inexistant")), password);
    return { error: (await getI18n()).t("account.err.login") };
  }
  if (c.lockedUntil && c.lockedUntil > new Date()) return { error: (await getI18n()).t("account.err.locked") };
  if (!(await verifyPassword(c.passwordHash, password))) {
    const failed = c.failedLogins + 1;
    await db.customer.update({ where: { id: c.id }, data: { failedLogins: failed, lockedUntil: lockoutAfterFailure(failed) } });
    return { error: (await getI18n()).t("account.err.login") };
  }
  await db.customer.update({ where: { id: c.id }, data: { failedLogins: 0, lockedUntil: null } });
  await startCustomerSession(c.id);
  redirect("/compte");
}

export async function customerLogoutAction() {
  await endCustomerSession();
  redirect("/compte");
}

export async function saveProfileAction(_: Result, form: FormData): Promise<Result> {
  const c = await getCustomer();
  if (!c) redirect("/compte");
  const s = (k: string, n: number) => String(form.get(k) ?? "").trim().slice(0, n);
  const phone = s("phone", 20);
  if (phone && !/^\+?[0-9 .()-]{8,20}$/.test(phone)) return { error: (await getI18n()).t("account.err.phone") };
  await db.customer.update({ where: { id: c.id }, data: { firstName: s("firstName", 60), lastName: s("lastName", 60), phone } });
  revalidatePath("/compte");
  return { ok: (await getI18n()).t("account.saved") };
}

export async function deleteAddressAction(form: FormData) {
  const c = await getCustomer();
  if (!c) return;
  await db.customerAddress.deleteMany({ where: { id: String(form.get("id")), customerId: c.id } });
  revalidatePath("/compte");
}

/**
 * Suppression du compte (RGPD) : les données personnelles sont effacées ou anonymisées.
 * Les commandes restent pour la comptabilité (obligation légale de conservation),
 * mais sans nom, téléphone, e-mail ni adresse.
 */
export async function deleteAccountAction(_: Result, form: FormData): Promise<Result> {
  const c = await getCustomer();
  if (!c) redirect("/compte");
  const { t } = await getI18n();
  const word = String(form.get("confirm") ?? "").trim().toUpperCase();
  if (word !== "SUPPRIMER" && word !== t("account.deleteWord").toUpperCase()) return { error: t("account.err.deleteWord", { word: t("account.deleteWord") }) };
  const anon = `supprime-${c.id}@anonyme.invalid`;
  await db.$transaction([
    db.order.updateMany({
      where: { customerId: c.id },
      data: { customerId: null, customerName: "Client supprimé", customerPhone: "", customerEmail: "", addressStreet: "", addressExtra: "", deliveryNotes: "" },
    }),
    db.customerAddress.deleteMany({ where: { customerId: c.id } }),
    db.session.deleteMany({ where: { customerId: c.id } }),
    db.customer.update({ where: { id: c.id }, data: { email: anon, phone: "", firstName: "", lastName: "", passwordHash: "", anonymizedAt: new Date() } }),
  ]);
  await audit({ actor: "Client", action: "customer.erase", entityType: "Customer", entityId: c.id, ip: await clientIp() });
  await endCustomerSession();
  redirect("/compte?supprime=1");
}

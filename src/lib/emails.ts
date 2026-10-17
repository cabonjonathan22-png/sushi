import type { MessageKey } from "@/i18n/fr";
import type { T } from "@/i18n/server";
import { euros } from "./money";
import type { FullOrder, OrderLineOption } from "./orders/load";
import { formatDay, localDate, localHHMM } from "./time";

/**
 * Gabarits d'e-mails (HTML simple, compatible avec tous les clients mail).
 * Client : dans la langue de sa commande (order.locale). Restaurant : langue du site.
 */
export interface MailContext {
  t: T;
  locale: string;
  /** Nom de l'enseigne (Réglages) : en-tête et objets des e-mails. */
  brand: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function slotText(o: FullOrder, c: MailContext): string {
  return c.t("email.slot", { day: formatDay(localDate(o.slotStart), c.locale), time: localHHMM(o.slotStart) });
}

/** En-tête : nom de l'enseigne, dernier mot en couleur (comme sur le site). */
function header(brand: string): string {
  const words = esc(brand.trim()).split(/\s+/);
  const last = words.length > 1 ? words.pop() : "";
  return `${words.join(" ")}${last ? ` <span style="color:#F1562A;font-style:italic">${last}</span>` : ""}`;
}

function layout(c: MailContext, title: string, body: string): string {
  return `<!doctype html><html lang="${esc(c.locale)}"><body style="margin:0;background:#f3ebdf;font-family:Arial,Helvetica,sans-serif;color:#1f1a17">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#1f1a17;color:#fbf7f1;padding:18px 24px;font-family:Georgia,'Times New Roman',serif;font-size:24px">${header(c.brand)}</td></tr>
<tr><td style="padding:24px"><h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:22px;margin:0 0 16px">${esc(title)}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string, dark = false) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:${dark ? "#1f1a17" : "#F1562A"};color:${dark ? "#fff" : "#1f1a17"};padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;

function linesTable(o: FullOrder, { t }: MailContext): string {
  const rows = o.lines.map((l) => {
    const opts = (l.options as unknown as OrderLineOption[]).map((x) => x.name).join(", ");
    const detail = [l.variantLabel, opts].filter(Boolean).join(" · ");
    return `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${l.quantity} × ${esc(l.name)}${detail ? `<br><span style="color:#666;font-size:13px">${esc(detail)}</span>` : ""}</td>
<td align="right" style="padding:6px 0;border-bottom:1px solid #eee;white-space:nowrap">${euros(l.totalCents)}</td></tr>`;
  });
  const extra = [
    o.extrasDiscountCents ? `<tr><td>${esc(t("track.extras"))}</td><td align="right">−${euros(o.extrasDiscountCents)}</td></tr>` : "",
    o.discountCents ? `<tr><td>${esc(t("track.discount", { code: o.promoCode ?? "" }))}</td><td align="right">−${euros(o.discountCents)}</td></tr>` : "",
    o.mode === "DELIVERY" ? `<tr><td>${esc(t("checkout.delivery"))}</td><td align="right">${o.deliveryFeeCents ? euros(o.deliveryFeeCents) : esc(t("checkout.deliveryFree"))}</td></tr>` : "",
  ].join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${rows.join("")}${extra}
<tr><td style="padding-top:10px;font-weight:bold">${esc(t("checkout.total"))}</td><td align="right" style="padding-top:10px;font-weight:bold">${euros(o.totalCents)}</td></tr></table>`;
}

function infoBlock(o: FullOrder, c: MailContext): string {
  const { t } = c;
  const mode = t(`mode.${o.mode}`);
  const where = o.mode === "DELIVERY"
    ? t("email.deliveryAt", { address: `${o.addressStreet}${o.addressExtra ? `, ${o.addressExtra}` : ""}, ${o.postalCode} ${o.city}` })
    : t("email.pickupAt", { mode, address: `${o.restaurant.street}, ${o.restaurant.postalCode} ${o.restaurant.city}` });
  return `<p style="font-size:15px;line-height:1.5"><strong>${esc(mode)}</strong> — ${esc(slotText(o, c))}<br>${esc(where)}<br>
${esc(t("email.payment", { method: t(`pay.${o.paymentMethod}`), status: t(`payStatus.${o.paymentStatus}`) }))}</p>`;
}

export function customerConfirmation(o: FullOrder, c: MailContext) {
  const { t } = c;
  const url = `${appUrl()}/commande/${o.trackingToken}`;
  const html = layout(c, t("email.received", { n: o.dailyNumber }), `${infoBlock(o, c)}${linesTable(o, c)}
${button(url, t("email.track"))}
<p style="color:#666;font-size:13px">${esc(t("email.reference", { reference: o.reference }))} · ${esc(o.restaurant.name)} · ${esc(o.restaurant.phones.join(" / "))}</p>`);
  const text = [
    t("email.received", { n: o.dailyNumber }) + ` (${o.reference})`,
    `${t(`mode.${o.mode}`)} — ${slotText(o, c)}`,
    `${t("checkout.total")} : ${euros(o.totalCents)}`,
    url,
  ].join("\n");
  return { subject: t("email.subjectConfirm", { n: o.dailyNumber, restaurant: o.restaurant.name }), html, text };
}

/** E-mail d'alerte au restaurant (langue du site). */
export function restaurantNewOrder(o: FullOrder, c: MailContext) {
  const { t } = c;
  const mode = t(`mode.${o.mode}`);
  const url = `${appUrl()}/admin/commandes/${o.id}`;
  const html = layout(c, t("email.newOrder", { n: o.dailyNumber, mode: mode.toUpperCase() }), `${infoBlock(o, c)}
<p style="font-size:15px">${esc(t("email.customer"))} <strong>${esc(o.customerName)}</strong> — ${esc(o.customerPhone)}</p>
${o.notes ? `<p style="background:#fff6e5;padding:10px;border-radius:6px">${esc(t("email.note", { note: o.notes }))}</p>` : ""}${linesTable(o, c)}
${button(url, t("email.openOrder"), true)}`);
  const text = `${t("email.newOrder", { n: o.dailyNumber, mode })} — ${slotText(o, c)}\n${o.customerName} ${o.customerPhone}\n${t("checkout.total")} ${euros(o.totalCents)}\n${url}`;
  return { subject: `${t("email.newOrder", { n: o.dailyNumber, mode })} — ${localHHMM(o.slotStart)} — ${euros(o.totalCents)}`, html, text };
}

const STATUS_MESSAGES = new Set(["ACCEPTED", "READY", "OUT_FOR_DELIVERY", "CANCELLED"]);

export function customerStatusChange(o: FullOrder, c: MailContext) {
  const { t } = c;
  const status = t(`status.${o.status}`);
  const msg = STATUS_MESSAGES.has(o.status) ? t(`email.status.${o.status}` as MessageKey) : t("email.newStatus", { status });
  const url = `${appUrl()}/commande/${o.trackingToken}`;
  const html = layout(c, t("email.subjectStatus", { n: o.dailyNumber, status }), `<p style="font-size:16px">${esc(msg)}</p>
${o.status === "CANCELLED" && o.cancelReason ? `<p>${esc(t("track.reason", { reason: o.cancelReason }))}</p>` : ""}
<p><a href="${url}">${esc(t("email.viewOrder"))}</a> · ${esc(o.restaurant.phones.join(" / "))}</p>`);
  return { subject: t("email.subjectStatus", { n: o.dailyNumber, status }), html, text: `${msg}\n${url}` };
}

export function passwordResetMail(link: string, c: MailContext) {
  const { t } = c;
  const html = layout(c, t("email.pwTitle"), `<p>${esc(t("email.pwText"))}</p>
${button(link, t("email.pwButton"))}
<p style="color:#666;font-size:13px">${esc(t("email.pwIgnore"))}</p>`);
  return { subject: t("email.pwSubject", { brand: c.brand }), html, text: `${t("email.pwButton")} : ${link}` };
}

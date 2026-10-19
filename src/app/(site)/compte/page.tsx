import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { ReorderButton } from "@/components/order/ReorderButton";
import { LoyaltyCard } from "@/components/site/LoyaltyCard";
import { getCustomer } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { getI18n } from "@/i18n/server";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import type { OrderLineOption } from "@/lib/orders/load";
import { formatDateTime } from "@/lib/time";
import { customerLoginAction, customerLogoutAction, deleteAccountAction, deleteAddressAction, requestLinkAction, saveProfileAction } from "./actions";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const c = await getCustomer();
  const deleted = (await searchParams).supprime;
  const { t } = await getI18n();
  if (!(await getConfig()).customers.accountsEnabled && !c) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-5xl">{t("account.title")}</h1><p className="mt-3 text-neutral-700">{t("account.disabled")}</p></div>;
  }

  if (!c) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-5xl">{t("account.title")}</h1>
        {deleted && <p className="mt-3 rounded-xl bg-green-50 p-3 font-semibold text-green-800">{t("account.deleted")}</p>}
        <p className="mt-2 text-neutral-700">{t("account.intro")}</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="card p-6">
            <h2 className="text-3xl">{t("account.login")}</h2>
            <ActionForm action={customerLoginAction} className="mt-3 grid gap-3">
              <div><label className="label" htmlFor="le">{t("account.email")}</label><input id="le" name="email" type="email" autoComplete="username" required className="input" /></div>
              <div><label className="label" htmlFor="lp">{t("account.password")}</label><input id="lp" name="password" type="password" autoComplete="current-password" required className="input" /></div>
              <SubmitButton className="btn-dark">{t("account.login")}</SubmitButton>
            </ActionForm>
          </section>
          <section className="card p-6">
            <h2 className="text-3xl">{t("account.create")}</h2>
            <p className="mt-1 text-sm text-neutral-700">{t("account.createHint")}</p>
            <ActionForm action={requestLinkAction} className="mt-3 grid gap-3">
              <div><label className="label" htmlFor="re">{t("account.email")}</label><input id="re" name="email" type="email" autoComplete="email" required className="input" /></div>
              <SubmitButton className="btn-primary">{t("account.sendLink")}</SubmitButton>
            </ActionForm>
          </section>
        </div>
      </div>
    );
  }

  const orders = await db.order.findMany({
    where: { customerId: c.id, status: { not: "PENDING_PAYMENT" } },
    orderBy: { placedAt: "desc" },
    take: 30,
    include: { lines: true, restaurant: { select: { slug: true, name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-5xl">{t("account.hello", { name: c.firstName || "" })}</h1>
        <form action={customerLogoutAction}><button className="btn-ghost">{t("account.logout")}</button></form>
      </div>

      <LoyaltyCard customerId={c.id} t={t} />

      <section className="card p-5">
        <h2 className="text-3xl">{t("account.orders")}</h2>
        {orders.length === 0 ? <p className="mt-2 text-neutral-600">{t("account.noOrders")} <Link href="/commander" className="underline">{t("nav.order")}</Link></p> : (
          <ul className="mt-2 divide-y">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/commande/${o.trackingToken}`} className="font-semibold underline">{formatDateTime(o.placedAt)} — {euros(o.totalCents)}</Link>
                  <p className="text-sm text-neutral-600">{t(`mode.${o.mode}`)} · {t(`status.${o.status}`)} · {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</p>
                </div>
                <ReorderButton slug={o.restaurant.slug} className="btn-primary min-h-10 px-4 text-sm" lines={o.lines.filter((l) => l.productId).map((l) => ({
                  productId: l.productId!, variantId: l.variantId, quantity: l.quantity,
                  optionIds: (l.options as unknown as OrderLineOption[]).map((x) => x.id).filter((x): x is string => !!x),
                }))} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-3xl">{t("account.profile")}</h2>
          <ActionForm action={saveProfileAction} className="mt-3 grid gap-3">
            <p className="text-sm text-neutral-600">{c.email}</p>
            <div><label className="label" htmlFor="fn">{t("checkout.firstName")}</label><input id="fn" name="firstName" defaultValue={c.firstName} autoComplete="given-name" className="input" /></div>
            <div><label className="label" htmlFor="ln">{t("checkout.lastName")}</label><input id="ln" name="lastName" defaultValue={c.lastName} autoComplete="family-name" className="input" /></div>
            <div><label className="label" htmlFor="ph">{t("checkout.phone")}</label><input id="ph" name="phone" defaultValue={c.phone} autoComplete="tel" className="input" /></div>
            <SubmitButton className="btn-dark">{t("account.save")}</SubmitButton>
          </ActionForm>
        </section>
        <section className="card p-5">
          <h2 className="text-3xl">{t("account.addresses")}</h2>
          <ul className="mt-2 divide-y">
            {c.addresses.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>{a.street}{a.extra && `, ${a.extra}`}<br /><span className="text-sm text-neutral-600">{a.postalCode} {a.city}</span></span>
                <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><button className="text-sm text-red-700 underline">{t("account.delete")}</button></form>
              </li>
            ))}
            {c.addresses.length === 0 && <li className="py-2 text-sm text-neutral-600">{t("account.noAddresses")}</li>}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-3xl">{t("account.data")}</h2>
        <p className="mt-1 text-sm text-neutral-700">{t("account.dataHint")}</p>
        <a href="/compte/export" className="btn-ghost mt-3">{t("account.download")}</a>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-800">{t("account.deleteAccount")}</summary>
          <ActionForm action={deleteAccountAction} className="mt-3 grid max-w-sm gap-2">
            <p className="text-sm text-neutral-700">{t("account.deleteHint")}</p>
            <label className="label" htmlFor="conf">{t("account.typeDelete")}</label>
            <input id="conf" name="confirm" className="input" autoComplete="off" />
            <SubmitButton className="btn-danger">{t("account.deleteForever")}</SubmitButton>
          </ActionForm>
        </details>
      </section>
    </div>
  );
}

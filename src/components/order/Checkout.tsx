"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PricedCart } from "@/lib/cart";
import { errorText, useI18n } from "@/i18n/client";
import { euros, vatLabel } from "@/lib/money";
import { citiesForPostalCode, findZone } from "@/lib/zones";
import { useCart } from "./cart-store";
import { LoyaltyBox, type LoyaltyPreview } from "./LoyaltyBox";
import { StripePay } from "./StripePay";
import type { ClientRestaurant } from "./types";

type Mode = "PICKUP" | "DELIVERY" | "DINE_IN";
type Slot = { start: string; label: string; period: "LUNCH" | "DINNER"; full: boolean };
type Day = { date: string; label: string; slots: Slot[] };
type Address = { street: string; extra: string; postalCode: string; city: string; notes: string };
type Customer = { firstName: string; lastName: string; phone: string; email: string };

export interface CheckoutProps {
  restaurant: ClientRestaurant;
  account: { customer: Customer; addresses: Address[] } | null;
  options?: { requireEmail: boolean; allowNotes: boolean; accountsEnabled: boolean; notesPlaceholder?: string };
  /** Pays (ISO) : contrôle du code postal et autocomplétion d'adresse (France uniquement). */
  country?: string;
}

/** Code postal complet ? France : 5 chiffres ; ailleurs : au moins 3 caractères. */
const postalComplete = (cp: string, country: string) => (country === "FR" ? /^\d{5}$/.test(cp) : cp.trim().length >= 3);

const EMPTY_ADDRESS: Address = { street: "", extra: "", postalCode: "", city: "", notes: "" };
const MEMO_KEY = "ys_checkout";

export function Checkout({ restaurant, account, options = { requireEmail: true, allowNotes: true, accountsEnabled: true }, country = "FR" }: CheckoutProps) {
  const { t } = useI18n();
  const router = useRouter();
  const modeLabel = (m: Mode) => t(`mode.${m}`);
  const cart = useCart(restaurant.slug);
  const modes = (["PICKUP", "DELIVERY", "DINE_IN"] as Mode[]).filter((m) => restaurant.services[m]);

  const [mode, setMode] = useState<Mode>(modes[0] ?? "PICKUP");
  const [address, setAddress] = useState<Address>(account?.addresses[0] ?? EMPTY_ADDRESS);
  const [customer, setCustomer] = useState<Customer>(account?.customer ?? { firstName: "", lastName: "", phone: "", email: "" });
  const [days, setDays] = useState<Day[] | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [preview, setPreview] = useState<(PricedCart & { loyalty?: LoyaltyPreview | null }) | null>(null);
  const [rewardId, setRewardId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{ clientSecret: string; publishableKey: string; token: string; amount: number } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Coordonnées mémorisées sur cet appareil (gain de temps pour la prochaine commande).
  useEffect(() => {
    if (account) return;
    try {
      const memo = JSON.parse(localStorage.getItem(MEMO_KEY) ?? "null") as { customer?: Customer; address?: Address; mode?: Mode } | null;
      if (memo?.customer) setCustomer(memo.customer);
      if (memo?.address) setAddress(memo.address);
      if (memo?.mode && restaurant.services[memo.mode]) setMode(memo.mode);
    } catch { /* rien de mémorisé */ }
  }, [account, restaurant.services]);

  const cpOk = postalComplete(address.postalCode, country);
  const zone = mode === "DELIVERY" && cpOk && address.city ? findZone(restaurant.zones, address.postalCode, address.city) : null;
  const servedPostalCodes = [...new Set(restaurant.zones.flatMap((z) => z.areas.map((a) => a.postalCode)))];
  const cities = cpOk ? citiesForPostalCode(restaurant.zones, address.postalCode) : [];
  const payMethods = restaurant.paymentMethods.filter((m) => m[mode] && (m.method !== "ONLINE_CARD" || restaurant.stripeEnabled));

  useEffect(() => {
    if (!payMethods.some((m) => m.method === paymentMethod)) setPaymentMethod(payMethods[0]?.method ?? "");
  }, [mode, payMethods, paymentMethod]);

  // Créneaux (rechargés selon le mode et la zone : la livraison ajoute le temps de trajet).
  useEffect(() => {
    if (mode === "DELIVERY" && !zone) {
      setDays(null);
      setSlot(null);
      return;
    }
    let cancelled = false;
    setDays(null);
    fetch(`/api/restaurants/${restaurant.slug}/slots?mode=${mode}${zone ? `&zone=${zone.id}` : ""}`)
      .then((r) => r.json())
      .then((d: { days: Day[] }) => {
        if (cancelled) return;
        setDays(d.days);
        setDayIdx(0);
        setSlot((cur) => (cur && d.days.some((x) => x.slots.some((s) => s.start === cur.start && !s.full)) ? cur : null));
      })
      .catch(() => !cancelled && setDays([]));
    return () => { cancelled = true; };
  }, [mode, zone?.id, restaurant.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Récapitulatif calculé par le serveur (remise, frais, minimum, TVA).
  const lines = useMemo(() => cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId, optionIds: i.optionIds, quantity: i.quantity })), [cart.items]);
  useEffect(() => {
    if (!lines.length) return;
    const timer = setTimeout(() => {
      fetch("/api/checkout/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantSlug: restaurant.slug, mode, period: slot?.period ?? "LUNCH", zoneId: zone?.id ?? null, promoCode: promoCode || undefined, rewardId: rewardId || undefined, lines }),
      }).then((r) => r.json()).then(setPreview).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [lines, mode, slot?.period, zone?.id, promoCode, rewardId, restaurant.slug]);

  if (!mounted) return <p className="px-4 py-16 text-center text-neutral-600">{t("checkout.loading")}</p>;
  if (!cart.items.length && !payment) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-5xl">{t("checkout.emptyTitle")}</h1>
        <Link href={`/commander/${restaurant.slug}`} className="btn-primary mt-6">{t("checkout.seeMenu")}</Link>
      </div>
    );
  }

  const submit = async () => {
    setErrors([]);
    const local: string[] = [];
    if (!slot) local.push(t("checkout.errSlot"));
    if (mode === "DELIVERY" && !zone) local.push(t("checkout.errZone"));
    if (!paymentMethod) local.push(t("checkout.errPayment"));
    if (preview?.containsAlcohol && !ageConfirmed) local.push(t("checkout.errAge"));
    if (!acceptTerms) local.push(t("checkout.errTerms"));
    if (local.length) {
      setErrors(local);
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(MEMO_KEY, JSON.stringify({ customer, address, mode }));
    } catch { /* stockage indisponible */ }
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug, mode, slotStart: slot!.start, lines, customer,
        address: mode === "DELIVERY" ? address : null, notes, paymentMethod,
        promoCode: promoCode || undefined, rewardId: (preview?.rewardApplied && rewardId) || undefined, ageConfirmed, acceptTerms, saveAddress,
      }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => null)) as
      | { ok: true; trackingToken: string; payment: { clientSecret: string; publishableKey: string } | null }
      | { ok: false; errors: { code?: string; message: string; params?: Record<string, string | number> }[] } | null) : null;
    setBusy(false);
    if (!data) return setErrors([t("checkout.errNetwork")]);
    if (!data.ok) {
      setErrors(data.errors.map((e) => errorText(t, e)));
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Créneau pris entre-temps : on recharge la liste.
      if (data.errors.some((e) => e.code === "SLOT_UNAVAILABLE")) setSlot(null);
      return;
    }
    if (data.payment) {
      setPayment({ ...data.payment, token: data.trackingToken, amount: preview?.totalCents ?? 0 });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      cart.clear();
      router.push(`/commande/${data.trackingToken}?nouvelle=1`);
    }
  };

  if (payment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-5xl">{t("checkout.paymentTitle")}</h1>
        <p className="mb-6 text-neutral-700">{t("checkout.paymentIntro", { amount: euros(payment.amount) })}</p>
        <div className="card p-5">
          <StripePay publishableKey={payment.publishableKey} clientSecret={payment.clientSecret} amountCents={payment.amount}
            returnUrl={`${window.location.origin}/commande/${payment.token}?nouvelle=1`}
            onPaid={() => {
              cart.clear();
              router.push(`/commande/${payment.token}?nouvelle=1`);
            }} />
        </div>
      </div>
    );
  }

  const day = days?.[dayIdx];
  const minRule = zone && (
    <div className={`mt-3 rounded-xl p-3 text-sm ${preview && preview.missingCents > 0 ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`} role="status">
      {!slot && zone.minDinnerCents !== zone.minLunchCents
        ? t("checkout.zoneRuleBoth", { zone: zone.name, lunch: euros(zone.minLunchCents), dinner: euros(zone.minDinnerCents) })
        : t("checkout.zoneRule", { zone: zone.name, min: euros(slot?.period === "DINNER" ? zone.minDinnerCents : zone.minLunchCents) })}
      {" · "}
      {zone.feeCents
        ? `${t("checkout.zoneFee", { fee: euros(zone.feeCents) })}${zone.freeFromCents ? `, ${t("checkout.zoneFreeFrom", { amount: euros(zone.freeFromCents) })}` : ""}`
        : t("checkout.zoneFree")}
      {preview && preview.missingCents > 0 && <><br /><strong>{t("checkout.missing", { amount: euros(preview.missingCents) })}</strong></>}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
      <div className="min-w-0 space-y-6">
        <div>
          <Link href={`/commander/${restaurant.slug}`} className="text-sm font-semibold underline">{t("checkout.back")}</Link>
          <h1 className="mt-2 text-5xl leading-none">{t("checkout.title")}</h1>
        </div>

        <div ref={errorRef} aria-live="assertive">
          {errors.length > 0 && (
            <ul className="rounded-xl bg-red-50 p-4 font-semibold text-red-800" role="alert">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>

        <section className="card p-5" aria-labelledby="s-mode">
          <h2 id="s-mode" className="text-3xl">{t("checkout.step1")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("checkout.modeLabel")}>
            {modes.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={`rounded-xl border-2 px-4 py-3 text-lg font-semibold ${mode === m ? "border-brand-600 bg-brand-50" : "border-neutral-200 bg-white"}`}>
                {modeLabel(m)}
              </button>
            ))}
          </div>
          {mode !== "DELIVERY" && <p className="mt-3 text-sm text-neutral-700">{t("checkout.atRestaurant", { address: `${restaurant.street}, ${restaurant.postalCode} ${restaurant.city}` })}</p>}

          {mode === "DELIVERY" && (
            <div className="mt-4 grid gap-3">
              {account && account.addresses.length > 1 && (
                <div>
                  <label className="label" htmlFor="saved">{t("checkout.savedAddresses")}</label>
                  <select id="saved" className="input" onChange={(e) => setAddress(account.addresses[Number(e.target.value)] ?? EMPTY_ADDRESS)}>
                    {account.addresses.map((a, i) => <option key={i} value={i}>{a.street}, {a.city}</option>)}
                  </select>
                </div>
              )}
              <AddressField label={t("checkout.street")} placeholder={t("checkout.streetPlaceholder")} value={address.street}
                search={(q) => (country === "FR" ? searchAddress(q, servedPostalCodes) : Promise.resolve([]))}
                onChange={(street) => setAddress((a) => ({ ...a, street }))}
                onPick={(s) => setAddress((a) => ({ ...a, street: s.street, postalCode: s.postalCode, city: s.city }))} />
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <div>
                  <label className="label" htmlFor="cp">{t("checkout.postalCode")}</label>
                  <input id="cp" className="input" inputMode={country === "FR" ? "numeric" : "text"} autoComplete="postal-code" maxLength={country === "FR" ? 5 : 10} value={address.postalCode}
                    onChange={(e) => setAddress((a) => ({ ...a, postalCode: country === "FR" ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value.toUpperCase().slice(0, 10) }))} />
                </div>
                <div>
                  <label className="label" htmlFor="city">{t("checkout.city")}</label>
                  {cities.length > 0 ? (
                    <select id="city" className="input" value={cities.find((c) => c.toLowerCase() === address.city.toLowerCase()) ?? ""}
                      onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}>
                      <option value="">{t("checkout.chooseCity")}</option>
                      {cities.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input id="city" className="input" autoComplete="address-level2" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                  )}
                </div>
              </div>
              {cpOk && address.city && !zone && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                  {t("checkout.notDelivered", { city: address.city })} <Link href="/livraison" className="underline">{t("checkout.seeTowns")}</Link> {t("checkout.orPickup")}
                </p>
              )}
              {minRule}
              <div>
                <label className="label" htmlFor="extra">{t("checkout.extra")}</label>
                <input id="extra" className="input" value={address.extra} onChange={(e) => setAddress((a) => ({ ...a, extra: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="dnotes">{t("checkout.driverNotes")}</label>
                <input id="dnotes" className="input" value={address.notes} onChange={(e) => setAddress((a) => ({ ...a, notes: e.target.value }))} />
              </div>
              {account && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  {t("checkout.saveAddress")}
                </label>
              )}
            </div>
          )}
        </section>

        <section className="card p-5" aria-labelledby="s-slot">
          <h2 id="s-slot" className="text-3xl">{t("checkout.step2")}</h2>
          {mode === "DELIVERY" && !zone ? (
            <p className="mt-2 text-neutral-700">{t("checkout.addressFirst")}</p>
          ) : days === null ? (
            <p className="mt-2 text-neutral-700" aria-busy="true">{t("checkout.loadingSlots")}</p>
          ) : days.length === 0 ? (
            <p className="mt-2 font-semibold text-red-800">
              {restaurant.paused ? restaurant.pausedReason || t("checkout.pausedDefault") : t("checkout.noSlots")}
            </p>
          ) : (
            <>
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label={t("checkout.day")}>
                {days.map((d, i) => (
                  <button key={d.date} type="button" role="tab" aria-selected={i === dayIdx} onClick={() => setDayIdx(i)}
                    className={`shrink-0 rounded-full px-4 py-2 font-semibold ${i === dayIdx ? "bg-ink text-white" : "bg-white ring-1 ring-neutral-300"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              {day && (["LUNCH", "DINNER"] as const).map((period) => {
                const s = day.slots.filter((x) => x.period === period);
                if (!s.length) return null;
                return (
                  <div key={period} className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-neutral-600">{period === "LUNCH" ? t("checkout.lunch") : t("checkout.dinner")}</p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {s.map((x) => (
                        <button key={x.start} type="button" disabled={x.full} onClick={() => setSlot(x)} aria-pressed={slot?.start === x.start}
                          className={`rounded-lg py-2.5 font-semibold ${slot?.start === x.start ? "bg-brand-600 text-white" : "bg-white ring-1 ring-neutral-300"} disabled:bg-neutral-100 disabled:text-neutral-400 disabled:line-through`}>
                          {x.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </section>

        <section className="card p-5" aria-labelledby="s-contact">
          <h2 id="s-contact" className="text-3xl">{t("checkout.step3")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field id="fn" label={t("checkout.firstName")} auto="given-name" value={customer.firstName} onChange={(v) => setCustomer((c) => ({ ...c, firstName: v }))} />
            <Field id="ln" label={t("checkout.lastName")} auto="family-name" value={customer.lastName} onChange={(v) => setCustomer((c) => ({ ...c, lastName: v }))} />
            <Field id="ph" label={t("checkout.phone")} auto="tel" type="tel" value={customer.phone} onChange={(v) => setCustomer((c) => ({ ...c, phone: v }))} />
            <Field id="em" label={options.requireEmail ? t("checkout.email") : t("checkout.emailOptional")} auto="email" type="email" required={options.requireEmail}
              value={customer.email} onChange={(v) => setCustomer((c) => ({ ...c, email: v }))} />
          </div>
          {options.allowNotes && (
            <>
              <label className="label mt-3" htmlFor="notes">{t("checkout.notes")}</label>
              <textarea id="notes" className="input min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={options.notesPlaceholder} />
            </>
          )}
          {!account && options.accountsEnabled && <p className="mt-2 text-sm text-neutral-600">{t("checkout.noAccount")} <Link href="/compte" className="underline">{t("checkout.login")}</Link> {t("checkout.loginHint")}</p>}
        </section>

        <section className="card p-5" aria-labelledby="s-pay">
          <h2 id="s-pay" className="text-3xl">{t("checkout.step4")}</h2>
          {payMethods.length === 0 ? <p className="mt-2 text-red-800">{t("checkout.noPayment")}</p> : (
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label={t("checkout.paymentLabel")}>
              {payMethods.map((m) => (
                <label key={m.method} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 ${paymentMethod === m.method ? "border-brand-600 bg-brand-50" : "border-neutral-200"}`}>
                  <input type="radio" name="pm" className="h-5 w-5 accent-brand-600" checked={paymentMethod === m.method} onChange={() => setPaymentMethod(m.method)} />
                  <span className="font-semibold">{t(`pay.${m.method}`)}</span>
                  <span className="ms-auto text-sm text-neutral-600">{m.method === "ONLINE_CARD" ? t("checkout.payNow") : mode === "DELIVERY" ? t("checkout.payOnDelivery") : t("checkout.payOnPickup")}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="mt-6 lg:mt-0">
        <div className="card sticky top-20 p-5">
          <h2 className="text-3xl">{t("checkout.summary")}</h2>
          {!preview ? <p className="mt-2 text-neutral-600">{t("checkout.computing")}</p> : (
            <>
              <ul className="mt-3 divide-y divide-neutral-100 text-sm">
                {preview.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span>{l.quantity} × {l.name}{l.variantLabel && <span className="block text-neutral-600">{l.variantLabel}</span>}
                      {l.options.length > 0 && <span className="block text-neutral-600">{l.options.map((o) => o.name).join(", ")}</span>}</span>
                    <span className="shrink-0 font-semibold">{euros(l.totalCents)}</span>
                  </li>
                ))}
              </ul>
              {preview.errors.filter((e) => e.code !== "MINIMUM_NOT_REACHED" && e.code !== "NO_ZONE").map((e) => (
                <p key={e.message} className="mt-2 text-sm font-semibold text-red-700">{errorText(t, e)}</p>
              ))}
              <dl className="mt-3 space-y-1 border-t border-neutral-200 pt-3">
                <div className="flex justify-between"><dt>{t("checkout.subtotal")}</dt><dd>{euros(preview.subtotalCents)}</dd></div>
                {preview.extrasDiscountCents > 0 && <div className="flex justify-between text-green-800"><dt>{t("checkout.extrasFree", { n: preview.freeExtras })}</dt><dd>−{euros(preview.extrasDiscountCents)}</dd></div>}
                {preview.discountCents > 0 && <div className="flex justify-between text-green-800"><dt>{t("checkout.discount", { code: preview.promoApplied ?? "" })}</dt><dd>−{euros(preview.discountCents)}</dd></div>}
                {preview.loyaltyDiscountCents > 0 && <div className="flex justify-between text-green-800"><dt>{t("loyalty.discount", { name: preview.rewardApplied?.name ?? "" })}</dt><dd>−{euros(preview.loyaltyDiscountCents)}</dd></div>}
                {mode === "DELIVERY" && <div className="flex justify-between"><dt>{t("checkout.delivery")}</dt><dd>{zone ? (preview.deliveryFeeCents ? euros(preview.deliveryFeeCents) : t("checkout.deliveryFree")) : "—"}</dd></div>}
                <div className="flex justify-between pt-1 text-xl font-bold"><dt>{t("checkout.total")}</dt><dd>{euros(preview.totalCents)}</dd></div>
                <div className="text-xs text-neutral-500">{t("checkout.vatIncluded", { lines: preview.vatBreakdown.map((v) => `${vatLabel(v.rate)} : ${euros(v.vatCents)}`).join(" · ") })}</div>
              </dl>
              {preview.missingCents > 0 && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  {t("checkout.minimum", { min: euros(preview.minimumCents), missing: euros(preview.missingCents) })}
                  {" "}<Link href={`/commander/${restaurant.slug}`} className="underline">{t("checkout.complete")}</Link>
                </p>
              )}
            </>
          )}

          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPromoCode(promoInput.trim().toUpperCase()); }}>
            <label htmlFor="promo" className="sr-only">{t("checkout.promo")}</label>
            <input id="promo" className="input" placeholder={t("checkout.promo")} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
            <button type="submit" className="btn-ghost">OK</button>
          </form>
          {promoCode && preview?.promoError && <p className="mt-1 text-sm text-red-700">{t("err.PROMO")}</p>}
          {promoCode && preview?.promoApplied && <p className="mt-1 text-sm text-green-800">{t("checkout.promoApplied", { code: preview.promoApplied })}</p>}
          {preview?.loyalty && <LoyaltyBox loyalty={preview.loyalty} rewardId={rewardId} onChange={setRewardId} />}

          {preview?.containsAlcohol && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />
              <span>{t("checkout.age")} {t("alcohol.minors")}</span>
            </label>
          )}
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-600" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>{t("checkout.acceptTerms")} <Link href="/cgv" target="_blank" className="underline">{t("checkout.termsLink")}</Link>.</span>
          </label>

          <button type="button" onClick={submit} disabled={busy || restaurant.paused || !preview || preview.missingCents > 0 || !cart.items.length} className="btn-primary mt-4 w-full text-lg">
            {busy ? t("checkout.sending") : paymentMethod === "ONLINE_CARD" ? t("checkout.toPayment") : t("checkout.order", { total: euros(preview?.totalCents ?? 0) })}
          </button>
          {slot && <p className="mt-2 text-center text-sm text-neutral-700">{t("checkout.when", { mode: modeLabel(mode), day: days?.find((d) => d.slots.some((x) => x.start === slot.start))?.label ?? "", time: slot.label })}</p>}
        </div>
      </aside>
    </div>
  );
}

function Field({ id, label, value, onChange, auto, type = "text", required = true }: { id: string; label: string; value: string; onChange: (v: string) => void; auto: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="input" autoComplete={auto} required={required} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type AddressSuggestion = { label: string; street: string; postalCode: string; city: string };

/**
 * Autocomplétion via la Base Adresse Nationale (France uniquement : api-adresse.data.gouv.fr).
 * Seules les adresses des codes postaux desservis sont proposées.
 */
async function searchAddress(q: string, postalCodes: string[]): Promise<AddressSuggestion[]> {
  if (q.trim().length < 4) return [];
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=20&autocomplete=1&lat=43.75&lon=5.43`);
    const data = (await res.json()) as { features: { properties: { label: string; name: string; postcode: string; city: string } }[] };
    return data.features
      .filter((f) => !postalCodes.length || postalCodes.includes(f.properties.postcode))
      .slice(0, 6)
      .map((f) => ({ label: f.properties.label, street: f.properties.name, postalCode: f.properties.postcode, city: f.properties.city }));
  } catch {
    return [];
  }
}

function AddressField({ label, placeholder, value, onChange, onPick, search }: {
  label: string; placeholder: string;
  value: string; onChange: (v: string) => void; onPick: (s: AddressSuggestion) => void; search: (q: string) => Promise<AddressSuggestion[]>;
}) {
  const [list, setList] = useState<AddressSuggestion[]>([]);
  const [focus, setFocus] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <div className="relative">
      <label className="label" htmlFor="street">{label}</label>
      <input id="street" className="input" autoComplete="street-address" role="combobox" aria-expanded={list.length > 0} aria-controls="street-list"
        aria-activedescendant={focus >= 0 ? `addr-${focus}` : undefined} value={value} placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          clearTimeout(timer.current);
          const q = e.target.value;
          timer.current = setTimeout(() => search(q).then((l) => { setList(l); setFocus(-1); }), 250);
        }}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(list.length - 1, f + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
          if (e.key === "Enter" && focus >= 0) { e.preventDefault(); onPick(list[focus]!); setList([]); }
          if (e.key === "Escape") setList([]);
        }}
        onBlur={() => setTimeout(() => setList([]), 150)} />
      {list.length > 0 && (
        <ul id="street-list" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/10">
          {list.map((s, i) => (
            <li key={s.label} id={`addr-${i}`} role="option" aria-selected={i === focus}>
              <button type="button" className={`block w-full px-4 py-3 text-start ${i === focus ? "bg-brand-50" : "hover:bg-neutral-50"}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(s); setList([]); }}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

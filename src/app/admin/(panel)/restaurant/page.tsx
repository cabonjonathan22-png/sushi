import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { HoursEditor } from "@/components/admin/HoursEditor";
import { adminRestaurant } from "@/lib/admin";
import { MODE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/catalog-constants";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { getConfig } from "@/lib/config";
import { can } from "@/lib/permissions";
import { bizprintKeys, listBizPrintPrinters, type BizPrintPrinter } from "@/lib/print/bizprint";
import { appUrl } from "@/lib/seo";
import {
  addClosureAction, createRestaurantAction, deleteClosureAction, deletePrinterAction, deleteZoneAction, rotatePrinterTokenAction,
  saveBizPrintAction, saveInfoAction, savePaymentMethodsAction, savePrinterAction, saveServicesAction, saveStripeAction, saveZoneAction,
} from "./actions";

export const metadata = { title: "Mon restaurant" };

const TABS = [
  ["infos", "Informations"],
  ["horaires", "Horaires"],
  ["livraison", "Livraison"],
  ["services", "Services & créneaux"],
  ["paiements", "Paiements"],
  ["impression", "Impression"],
] as const;

const eur = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const PRINTER_METHODS = {
  BROWSER: "Navigateur (toute imprimante du PC / tablette)",
  STAR_CLOUDPRNT: "Star CloudPRNT (imprimante réseau, sans PC)",
  EPSON_SDP: "Epson Server Direct Print (sans PC)",
  PRINTNODE: "PrintNode (USB / réseau via le service PrintNode)",
  LOCAL_AGENT: "Agent local Yaoma (ESC/POS réseau)",
  BIZPRINT: "BizPrint / BizSwoop (station BizPrint du restaurant)",
} as const;

export default async function RestaurantSettings({ searchParams }: { searchParams: Promise<{ onglet?: string; nouveau?: string }> }) {
  const { staff, current } = await adminRestaurant("restaurant.settings");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.onglet) ? sp.onglet! : "infos";
  const r = await db.restaurant.findUniqueOrThrow({
    where: { id: current.id },
    include: {
      openingHours: { orderBy: [{ weekday: "asc" }, { opens: "asc" }] },
      closures: { orderBy: { startDate: "asc" } },
      zones: { orderBy: { sortOrder: "asc" }, include: { areas: { orderBy: [{ postalCode: "asc" }, { city: "asc" }] } } },
      paymentMethods: true,
      printers: { orderBy: { name: "asc" } },
    },
  });
  const tech = can(staff.actor, "tech.config", r.id);
  const base = appUrl();

  // Imprimantes BizPrint du compte (affichées pour choisir leur n°).
  let bizPrinters: BizPrintPrinter[] | null = null;
  let bizError = "";
  if (tab === "impression" && r.bizprintPublicKey) {
    try {
      const keys = await bizprintKeys(r.id);
      if (keys) bizPrinters = await listBizPrintPrinters(keys);
    } catch (e) {
      bizError = (e as Error).message;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {sp.nouveau && <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">Restaurant créé (inactif). Complétez ses informations, horaires et zones, puis activez-le dans « Services ».</p>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-5xl">{r.name}</h1>
        {!r.active && <span className="chip bg-red-100 text-red-800">Inactif (invisible sur le site)</span>}
        <Link href={`/commander/${r.slug}`} target="_blank" className="btn-ghost">Voir sur le site</Link>
      </div>

      <nav className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?onglet=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 font-semibold ${tab === k ? "bg-ink text-white" : "bg-white ring-1 ring-neutral-300"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "infos" && (
        <ActionForm action={saveInfoAction} className="card grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="restaurantId" value={r.id} />
          <div className="sm:col-span-2"><label className="label" htmlFor="name">Nom affiché</label><input id="name" name="name" defaultValue={r.name} required className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="street">Adresse</label><input id="street" name="street" defaultValue={r.street} required className="input" /></div>
          <div><label className="label" htmlFor="cp">Code postal</label><input id="cp" name="postalCode" defaultValue={r.postalCode} required className="input" /></div>
          <div><label className="label" htmlFor="city">Ville</label><input id="city" name="city" defaultValue={r.city} required className="input" /></div>
          <div><label className="label" htmlFor="phones">Téléphones (un par ligne)</label><textarea id="phones" name="phones" defaultValue={r.phones.join("\n")} className="input" /></div>
          <div><label className="label" htmlFor="email">E-mail du restaurant</label><input id="email" name="email" type="email" defaultValue={r.email} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="maps">Lien Google Maps</label><input id="maps" name="mapsUrl" defaultValue={r.mapsUrl} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="desc">Présentation (page du restaurant)</label><textarea id="desc" name="description" defaultValue={r.description} className="input min-h-28" /></div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="alerts">E-mails qui reçoivent chaque nouvelle commande (un par ligne)</label>
            <textarea id="alerts" name="alertEmails" defaultValue={r.alertEmails.join("\n")} className="input" />
          </div>
          <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
        </ActionForm>
      )}

      {tab === "horaires" && (
        <>
          <section className="card p-5">
            <h2 className="mb-3 text-3xl">Horaires d'ouverture</h2>
            <HoursEditor restaurantId={r.id} cutoff={(await getConfig()).schedule.lunchDinnerCutoff} initial={r.openingHours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes, period: h.period }))} />
          </section>
          <section className="card p-5">
            <h2 className="text-3xl">Fermetures exceptionnelles</h2>
            <p className="text-sm text-neutral-600">Congés, jours fériés : aucune commande ne sera proposée ces jours-là.</p>
            <ul className="my-3 divide-y">
              {r.closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{c.startDate === c.endDate ? `Le ${c.startDate.split("-").reverse().join("/")}` : `Du ${c.startDate.split("-").reverse().join("/")} au ${c.endDate.split("-").reverse().join("/")}`}{c.reason && ` — ${c.reason}`}</span>
                  <form action={deleteClosureAction}><input type="hidden" name="id" value={c.id} /><button className="text-sm text-red-700 underline">Supprimer</button></form>
                </li>
              ))}
              {r.closures.length === 0 && <li className="py-2 text-neutral-500">Aucune.</li>}
            </ul>
            <ActionForm action={addClosureAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end" resetOnSuccess>
              <input type="hidden" name="restaurantId" value={r.id} />
              <div><label className="label" htmlFor="sd">Du</label><input id="sd" name="startDate" type="date" required className="input" /></div>
              <div><label className="label" htmlFor="ed">Au (inclus)</label><input id="ed" name="endDate" type="date" className="input" /></div>
              <div><label className="label" htmlFor="why">Motif</label><input id="why" name="reason" placeholder="Congés annuels" className="input" /></div>
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
          </section>
        </>
      )}

      {tab === "livraison" && (
        <div className="space-y-4">
          <p className="text-neutral-700">Une zone = des couples <strong>code postal + commune</strong> (une ligne chacun, ex. « 84160 Cadenet »). Le minimum est vérifié par le serveur au moment de la commande.</p>
          {[...r.zones, null].map((z) => (
            <details key={z?.id ?? "new"} className="card p-5" open={!z && r.zones.length === 0}>
              <summary className="cursor-pointer list-none">
                <span className="font-display text-3xl">{z ? z.name : "+ Nouvelle zone"}</span>
                {z && <span className="ml-3 text-sm text-neutral-600">{z.areas.length} commune(s) · midi {euros(z.minLunchCents)} · soir {euros(z.minDinnerCents)} · {z.feeCents ? `frais ${euros(z.feeCents)}` : "livraison offerte"}{!z.active && " · INACTIVE"}</span>}
              </summary>
              <ActionForm action={saveZoneAction} className="mt-4 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="restaurantId" value={r.id} />
                <input type="hidden" name="zoneId" value={z?.id ?? ""} />
                <div><label className="label">Nom</label><input name="name" defaultValue={z?.name ?? `Zone ${r.zones.length + 1}`} className="input" /></div>
                <div><label className="label">Minimum midi (€)</label><input name="minLunch" inputMode="decimal" defaultValue={eur(z?.minLunchCents ?? 2000)} className="input" /></div>
                <div><label className="label">Minimum soir (€)</label><input name="minDinner" inputMode="decimal" defaultValue={eur(z?.minDinnerCents ?? 3500)} className="input" /></div>
                <div><label className="label">Frais de livraison (€)</label><input name="fee" inputMode="decimal" defaultValue={eur(z?.feeCents ?? 0)} className="input" /></div>
                <div><label className="label">Gratuite dès (€, vide = jamais)</label><input name="freeFrom" inputMode="decimal" defaultValue={eur(z?.freeFromCents ?? null)} className="input" /></div>
                <div><label className="label">Délai de livraison (min)</label><input name="etaMinutes" type="number" min={0} max={240} defaultValue={z?.etaMinutes ?? 30} className="input" /></div>
                <div className="sm:col-span-3">
                  <label className="label">Communes desservies (« code postal commune », une par ligne)</label>
                  <textarea name="areas" className="input min-h-40 font-mono text-sm" defaultValue={z?.areas.map((a) => `${a.postalCode} ${a.city}`).join("\n") ?? ""} placeholder={"84160 Cucuron\n84160 Vaugines"} />
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={z?.active ?? true} className="h-5 w-5" />Zone active</label>
                <div className="sm:col-span-3"><SubmitButton>Enregistrer la zone</SubmitButton></div>
              </ActionForm>
              {z && <form action={deleteZoneAction} className="mt-3"><input type="hidden" name="id" value={z.id} /><button className="text-sm text-red-700 underline">Supprimer cette zone</button></form>}
            </details>
          ))}
        </div>
      )}

      {tab === "services" && (
        <ActionForm action={saveServicesAction} className="card grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="restaurantId" value={r.id} />
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="label">Services proposés</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="pickupEnabled" defaultChecked={r.pickupEnabled} className="h-5 w-5" />À emporter (retrait)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="deliveryEnabled" defaultChecked={r.deliveryEnabled} className="h-5 w-5" />Livraison</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="dineInEnabled" defaultChecked={r.dineInEnabled} className="h-5 w-5" />Commande sur place</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="noAlcoholDelivery" defaultChecked={r.noAlcoholDelivery} className="h-5 w-5" />Pas d'alcool en livraison</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={r.active} className="h-5 w-5" />Restaurant visible sur le site</label>
          </fieldset>
          <div><label className="label" htmlFor="prep">Délai de préparation minimum (min)</label><input id="prep" name="prepMinutes" type="number" min={0} max={240} defaultValue={r.prepMinutes} className="input" /></div>
          <div><label className="label" htmlFor="slot">Intervalle entre créneaux (min)</label><input id="slot" name="slotMinutes" type="number" min={5} max={120} step={5} defaultValue={r.slotMinutes} className="input" /></div>
          <div><label className="label" htmlFor="maxs">Commandes max par créneau (vide = illimité)</label><input id="maxs" name="maxOrdersPerSlot" type="number" min={1} defaultValue={r.maxOrdersPerSlot ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="days">Commande à l'avance (jours)</label><input id="days" name="maxDaysAhead" type="number" min={0} max={30} defaultValue={r.maxDaysAhead} className="input" /></div>
          <div><label className="label" htmlFor="pmin">Minimum de commande à emporter (€)</label><input id="pmin" name="pickupMinimum" inputMode="decimal" defaultValue={eur(r.pickupMinimumCents)} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
        </ActionForm>
      )}

      {tab === "paiements" && (
        <>
          <ActionForm action={savePaymentMethodsAction} className="card p-5">
            <input type="hidden" name="restaurantId" value={r.id} />
            <h2 className="text-3xl">Moyens de paiement acceptés</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left">
                <thead><tr className="text-sm text-neutral-600"><th className="py-2">Moyen</th>{(["PICKUP", "DELIVERY", "DINE_IN"] as const).map((m) => <th key={m} className="py-2 text-center">{MODE_LABELS[m]}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {(Object.keys(PAYMENT_METHOD_LABELS) as (keyof typeof PAYMENT_METHOD_LABELS)[]).map((m) => {
                    const pm = r.paymentMethods.find((x) => x.method === m);
                    return (
                      <tr key={m}>
                        <td className="py-2 font-semibold">{PAYMENT_METHOD_LABELS[m]}</td>
                        {(["PICKUP", "DELIVERY", "DINE_IN"] as const).map((mode) => (
                          <td key={mode} className="py-2 text-center">
                            <input type="checkbox" className="h-6 w-6" name={`${m}:${mode}`} aria-label={`${PAYMENT_METHOD_LABELS[m]} — ${MODE_LABELS[mode]}`}
                              defaultChecked={pm ? (mode === "PICKUP" ? pm.pickup : mode === "DELIVERY" ? pm.delivery : pm.dineIn) : false} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-neutral-600">La carte en ligne n'est proposée que si Stripe est configuré ci-dessous.</p>
            <div className="mt-3"><SubmitButton>Enregistrer</SubmitButton></div>
          </ActionForm>

          {tech && (
            <ActionForm action={saveStripeAction} className="card grid gap-3 p-5">
              <input type="hidden" name="restaurantId" value={r.id} />
              <h2 className="text-3xl">Stripe (paiement en ligne)</h2>
              <p className="text-sm">
                État : {r.stripeSecretKeyEnc && r.stripePublishableKey
                  ? <strong className="text-green-700">configuré ({r.stripePublishableKey.startsWith("pk_live") ? "mode réel" : "mode test"})</strong>
                  : <strong className="text-red-700">non configuré</strong>}
                {r.stripeSecretKeyEnc && !r.stripeWebhookSecretEnc && <span className="text-red-700"> — secret de webhook manquant</span>}
              </p>
              <p className="text-sm text-neutral-600">
                Webhook à créer dans Stripe (Développeurs → Webhooks) : <code className="break-all">{base}/api/stripe/webhook/{r.id}</code> — événements
                {" "}<code>payment_intent.succeeded</code>, <code>payment_intent.payment_failed</code>, <code>payment_intent.canceled</code>.
              </p>
              <div><label className="label" htmlFor="pk">Clé publiable (pk_…)</label><input id="pk" name="publishableKey" placeholder={r.stripePublishableKey || "pk_live_…"} className="input font-mono" /></div>
              <div><label className="label" htmlFor="sk">Clé secrète (sk_… ou clé restreinte rk_…)</label><input id="sk" name="secretKey" type="password" autoComplete="off" placeholder={r.stripeSecretKeyEnc ? "•••••••• (laisser vide pour conserver)" : "sk_live_…"} className="input font-mono" /></div>
              <div><label className="label" htmlFor="wh">Secret de signature du webhook (whsec_…)</label><input id="wh" name="webhookSecret" type="password" autoComplete="off" placeholder={r.stripeWebhookSecretEnc ? "•••••••• (laisser vide pour conserver)" : "whsec_…"} className="input font-mono" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="clear" className="h-4 w-4" />Supprimer la configuration Stripe</label>
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          )}
        </>
      )}

      {tab === "impression" && (
        <div className="space-y-4">
          <p className="text-neutral-700">
            <strong>Navigateur</strong> : fonctionne avec n'importe quelle imprimante installée sur l'ordinateur ou la tablette qui affiche « Commandes en cours ».
            Les autres méthodes impriment même quand aucun écran n'est ouvert.
          </p>
          {tech && (
            <section className="card grid gap-3 p-5">
              <h2 className="text-3xl">BizPrint (BizSwoop)</h2>
              <p className="text-sm text-neutral-700">
                Le service utilisé jusqu'ici avec WordPress. La « station » BizPrint installée au restaurant (PC, Mac, Raspberry Pi ou Android)
                imprime les tickets sur ses imprimantes. Clés : <a href="https://print.bizswoop.app/applications" target="_blank" rel="noopener" className="underline">print.bizswoop.app → Applications</a>.
              </p>
              <p className="text-sm">État : {r.bizprintPublicKey && r.bizprintSecretEnc ? <strong className="text-green-700">connecté</strong> : <strong className="text-red-700">non configuré</strong>}</p>
              {bizError && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{bizError}</p>}
              {bizPrinters && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-neutral-600"><tr><th className="py-1">N°</th><th className="py-1">Imprimante BizPrint</th><th className="py-1">Station</th><th className="py-1">Papier</th><th className="py-1">État</th></tr></thead>
                    <tbody className="divide-y">{bizPrinters.map((b) => (
                      <tr key={b.id}><td className="py-1 font-mono font-bold">{b.id}</td><td className="py-1">{b.title}</td><td className="py-1">{b.station}</td><td className="py-1">{b.paperSize}</td><td className="py-1">{b.enabled ? "active" : "désactivée"}</td></tr>
                    ))}</tbody>
                  </table>
                  <p className="mt-1 text-xs text-neutral-600">Créez ci-dessous une imprimante « BizPrint » et indiquez ce n°.</p>
                </div>
              )}
              <ActionForm action={saveBizPrintAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="restaurantId" value={r.id} />
                <div><label className="label" htmlFor="bpk">Clé publique</label><input id="bpk" name="publicKey" placeholder={r.bizprintPublicKey || "Clé publique"} className="input font-mono" /></div>
                <div><label className="label" htmlFor="bsk">Clé secrète</label><input id="bsk" name="secretKey" type="password" autoComplete="off" placeholder={r.bizprintSecretEnc ? "•••••••• (laisser vide pour conserver)" : "Clé secrète"} className="input font-mono" /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="clear" className="h-4 w-4" />Déconnecter BizPrint</label>
                <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
              </ActionForm>
            </section>
          )}
          {[...r.printers, null].map((p) => (
            <details key={p?.id ?? "new"} className="card p-5">
              <summary className="cursor-pointer list-none">
                <span className="font-display text-3xl">{p ? p.name : "+ Nouvelle imprimante"}</span>
                {p && <span className="ml-3 text-sm text-neutral-600">{PRINTER_METHODS[p.method]} · {p.paperWidth.replace("MM", "")} {p.paperWidth === "A4" ? "" : "mm"} · {p.copies} ex.{!p.active && " · INACTIVE"}{p.lastSeenAt && ` · vue le ${p.lastSeenAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`}</span>}
              </summary>
              <ActionForm action={savePrinterAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="restaurantId" value={r.id} />
                <input type="hidden" name="printerId" value={p?.id ?? ""} />
                <div><label className="label">Nom</label><input name="name" defaultValue={p?.name ?? "Cuisine"} className="input" /></div>
                <div><label className="label">Méthode</label>
                  <select name="method" defaultValue={p?.method ?? "STAR_CLOUDPRNT"} className="input">{Object.entries(PRINTER_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="label">Papier</label>
                  <select name="paperWidth" defaultValue={p?.paperWidth ?? "MM80"} className="input"><option value="MM58">58 mm</option><option value="MM80">80 mm</option><option value="A4">A4</option></select></div>
                <div><label className="label">Exemplaires</label><input name="copies" type="number" min={1} max={3} defaultValue={p?.copies ?? 1} className="input" /></div>
                <div><label className="label">N° d'imprimante (BizPrint ou PrintNode)</label><input name="remotePrinterId" inputMode="numeric" defaultValue={p?.remotePrinterId ?? ""} className="input" /></div>
                <div className="grid content-end gap-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="autoPrint" defaultChecked={p?.autoPrint ?? true} className="h-5 w-5" />Imprimer automatiquement chaque nouvelle commande</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-5 w-5" />Active</label>
                </div>
                <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
              </ActionForm>
              {p && !["BROWSER", "PRINTNODE", "BIZPRINT"].includes(p.method) && (
                <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm">
                  <p className="font-semibold">Adresse à saisir dans l'imprimante :</p>
                  <code className="block break-all">
                    {p.method === "STAR_CLOUDPRNT" ? `${base}/api/print/cloudprnt/${p.deviceToken}` : p.method === "EPSON_SDP" ? `${base}/api/print/epson/${p.deviceToken}` : `${base}/api/print/agent/${p.deviceToken}`}
                  </code>
                  <p className="mt-1 text-neutral-600">Cette adresse contient un jeton secret. En cas de doute, régénérez-le.</p>
                  <form action={rotatePrinterTokenAction} className="mt-2"><input type="hidden" name="id" value={p.id} /><button className="underline">Régénérer le jeton</button></form>
                </div>
              )}
              {p && <form action={deletePrinterAction} className="mt-3"><input type="hidden" name="id" value={p.id} /><button className="text-sm text-red-700 underline">Supprimer</button></form>}
            </details>
          ))}
        </div>
      )}

      {can(staff.actor, "restaurant.create") && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">+ Ajouter un autre restaurant</summary>
          <ActionForm action={createRestaurantAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div><label className="label" htmlFor="nn">Nom</label><input id="nn" name="name" required className="input" /></div>
            <div><label className="label" htmlFor="nc">Ville</label><input id="nc" name="city" required className="input" /></div>
            <SubmitButton>Créer</SubmitButton>
          </ActionForm>
          <p className="mt-2 text-sm text-neutral-600">Le menu est commun : le nouveau restaurant propose tous les produits, que vous pouvez ensuite retirer ou mettre à un autre prix.</p>
        </details>
      )}
    </div>
  );
}

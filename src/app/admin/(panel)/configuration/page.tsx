import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { LANGUAGES } from "@/i18n/languages";
import { adminContext } from "@/lib/admin";
import { STATUS_LABELS } from "@/lib/catalog-constants";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { saveConfigAction, saveRestaurantServicesAction } from "./actions";

export const metadata = { title: "Configuration" };

const NOTIFIABLE = ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const;

function Toggle({ restaurantId, field, on, label }: { restaurantId: string; field: string; on: boolean; label: string }) {
  return (
    <form action={saveRestaurantServicesAction}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={on ? "0" : "1"} />
      <button type="submit" role="switch" aria-checked={on} aria-label={label}
        className={`min-h-10 min-w-24 rounded-xl px-3 text-sm font-bold ${on ? "bg-green-600 text-white" : "bg-neutral-300 text-neutral-800"}`}>
        {on ? "Oui" : "Non"}
      </button>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-4 p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="text-3xl">{title}</h2>
        {hint && <p className="text-sm text-neutral-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Check = ({ name, label, on, hint }: { name: string; label: string; on: boolean; hint?: string }) => (
  <label className="flex items-start gap-2">
    <input type="checkbox" name={name} defaultChecked={on} className="mt-1 h-5 w-5" />
    <span>{label}{hint && <span className="block text-xs text-neutral-600">{hint}</span>}</span>
  </label>
);

export default async function ConfigurationPage() {
  const { staff, restaurants } = await adminContext("tech.config");
  const c = await getConfig();
  const full = await db.restaurant.findMany({
    where: { id: { in: restaurants.map((r) => r.id) } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, city: true, active: true, dineInEnabled: true, pickupEnabled: true, deliveryEnabled: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-5xl">Configuration</h1>
      <p className="text-neutral-700">Tous les réglages généraux. Les réglages propres à un restaurant (horaires, zones, paiements, imprimantes) sont dans <Link href="/admin/restaurant" className="underline">Mon restaurant</Link>.</p>

      <section className="card overflow-x-auto p-5">
        <h2 className="text-3xl">Services par restaurant</h2>
        <p className="text-sm text-neutral-600">Ce que chaque restaurant propose. Un restaurant non visible n'apparaît pas sur le site.</p>
        <table className="mt-3 w-full min-w-[560px] text-left">
          <thead className="text-sm text-neutral-600"><tr><th className="py-2">Restaurant</th><th className="py-2">Sur place</th><th className="py-2">À emporter</th><th className="py-2">Livraison</th><th className="py-2">Visible</th></tr></thead>
          <tbody className="divide-y">
            {full.map((r) => {
              const editable = can(staff.actor, "restaurant.settings", r.id);
              const cell = (field: string, on: boolean, label: string) => (
                <td className="py-2">{editable ? <Toggle restaurantId={r.id} field={field} on={on} label={`${label} — ${r.name}`} /> : on ? "Oui" : "Non"}</td>
              );
              return (
                <tr key={r.id}>
                  <td className="py-2 font-semibold">{r.name} <span className="font-normal text-neutral-500">{r.city}</span></td>
                  {cell("dineInEnabled", r.dineInEnabled, "Sur place")}
                  {cell("pickupEnabled", r.pickupEnabled, "À emporter")}
                  {cell("deliveryEnabled", r.deliveryEnabled, "Livraison")}
                  {cell("active", r.active, "Visible")}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-neutral-600">Menu propre à chaque restaurant : <Link href="/admin/menu" className="underline">Menu & ruptures</Link> (« Au menu / Retiré », « Affichée ici / Masquée ici ») et la case « Restaurants » de chaque fiche produit.</p>
      </section>

      <ActionForm action={saveConfigAction} className="space-y-6">
        <Section title="Commandes">
          <Check name="autoAccept" label="Accepter automatiquement les commandes" on={c.orders.autoAccept} hint="Elles arrivent directement « Acceptées » ; la sonnerie et l'impression fonctionnent toujours." />
          <Check name="requireEmail" label="E-mail obligatoire" on={c.orders.requireEmail} hint="Sinon facultatif (pas d'e-mail de confirmation sans adresse)." />
          <Check name="allowNotes" label="Autoriser une note pour la cuisine" on={c.orders.allowNotes} />
          <div><label className="label" htmlFor="pp">Paiement en ligne non finalisé : annuler après (minutes)</label><input id="pp" name="pendingPaymentMinutes" type="number" min={10} max={1440} defaultValue={c.orders.pendingPaymentMinutes} className="input" /></div>
          <div><label className="label" htmlFor="mq">Quantité maximum d'un même produit</label><input id="mq" name="maxLineQuantity" type="number" min={1} max={500} defaultValue={c.orders.maxLineQuantity} className="input" /></div>
          <fieldset className="sm:col-span-2">
            <legend className="label">E-mail envoyé au client quand la commande passe à :</legend>
            <div className="flex flex-wrap gap-4">
              {NOTIFIABLE.map((s) => (
                <label key={s} className="flex items-center gap-2"><input type="checkbox" name="notifyStatuses" value={s} defaultChecked={c.orders.notifyStatuses.includes(s)} className="h-5 w-5" />{STATUS_LABELS[s]}</label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Horaires et impression">
          <div><label className="label" htmlFor="cut">Heure séparant le midi du soir</label><input id="cut" name="lunchDinnerCutoff" type="time" defaultValue={c.schedule.lunchDinnerCutoff} className="input" />
            <p className="mt-1 text-xs text-neutral-600">Sert aux minimums midi / soir et aux plats « midi uniquement ».</p></div>
          <div><label className="label" htmlFor="dc">Exemplaires minimum pour une livraison</label><input id="dc" name="deliveryCopies" type="number" min={1} max={3} defaultValue={c.printing.deliveryCopies} className="input" /></div>
          <div><label className="label" htmlFor="ch">Répéter la sonnerie toutes les (secondes, 0 = jamais)</label><input id="ch" name="chimeRepeatSeconds" type="number" min={0} max={600} defaultValue={c.printing.chimeRepeatSeconds} className="input" /></div>
        </Section>

        <Section title="Site public" hint="Référencement Google, pied de page, annonce et réseaux sociaux.">
          <div className="sm:col-span-2"><label className="label" htmlFor="st">Titre (Google, onglet du navigateur) — 70 caractères max</label><input id="st" name="seoTitle" maxLength={70} defaultValue={c.site.seoTitle} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="sd">Description (Google) — 170 caractères max</label><textarea id="sd" name="seoDescription" maxLength={170} defaultValue={c.site.seoDescription} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ft">Texte du pied de page</label><textarea id="ft" name="footerText" maxLength={300} defaultValue={c.site.footerText} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="an">Bandeau d'annonce (ex. « Fermeture exceptionnelle le 1er mai »)</label><input id="an" name="announcement" maxLength={200} defaultValue={c.site.announcement} className="input" /></div>
          <Check name="announcementActive" label="Afficher le bandeau d'annonce" on={c.site.announcementActive} />
          <div />
          <div><label className="label" htmlFor="fb">Page Facebook</label><input id="fb" name="facebookUrl" type="url" defaultValue={c.site.facebookUrl} className="input" placeholder="https://facebook.com/…" /></div>
          <div><label className="label" htmlFor="ig">Instagram</label><input id="ig" name="instagramUrl" type="url" defaultValue={c.site.instagramUrl} className="input" placeholder="https://instagram.com/…" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="gr">Lien « Laisser un avis Google »</label><input id="gr" name="googleReviewUrl" type="url" defaultValue={c.site.googleReviewUrl} className="input" /></div>
          <div><label className="label" htmlFor="cu">Type de cuisine (ex. Japonaise, Italienne, Burger)</label><input id="cu" name="cuisine" maxLength={60} defaultValue={c.site.cuisine} className="input" />
            <p className="mt-1 text-xs text-neutral-600">Affiché sur l'accueil (« Cuisine japonaise · Cucuron ») et transmis à Google.</p></div>
          <div><label className="label" htmlFor="sp">Exemples dans la recherche du menu</label><input id="sp" name="searchPlaceholder" maxLength={80} defaultValue={c.site.searchPlaceholder} className="input" /></div>
          <div><label className="label" htmlFor="eh">Aide sous les « petits plus » du panier</label><input id="eh" name="extrasHint" maxLength={120} defaultValue={c.site.extrasHint} className="input" /></div>
          <div><label className="label" htmlFor="np">Exemple de note pour la cuisine</label><input id="np" name="notesPlaceholder" maxLength={80} defaultValue={c.site.notesPlaceholder} className="input" /></div>
          <p className="text-sm text-neutral-600 sm:col-span-2">Plats mis en avant sur l'accueil (« Nos incontournables ») : donnez le badge <strong>POPULAR</strong> ou <strong>CHEF</strong> aux produits voulus dans <Link href="/admin/menu" className="underline">Menu</Link>. Sans badge, le premier plat de chaque catégorie est affiché.</p>
        </Section>

        <Section title="Pays, devise et langues" hint="Le site s'affiche automatiquement dans la langue du téléphone ou de l'ordinateur du client, si elle est proposée ci-dessous.">
          <div><label className="label" htmlFor="co">Pays (code à 2 lettres : FR, BE, CH, US…)</label><input id="co" name="country" maxLength={2} defaultValue={c.region.country} className="input uppercase" required /></div>
          <div><label className="label" htmlFor="cy">Devise (code à 3 lettres : EUR, CHF, USD, GBP…)</label><input id="cy" name="currency" maxLength={3} defaultValue={c.region.currency} className="input uppercase" required /></div>
          <div>
            <label className="label" htmlFor="dl">Langue du restaurant (textes saisis, back-office)</label>
            <select id="dl" name="defaultLocale" defaultValue={c.region.defaultLocale} className="input">
              {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <Check name="autoDetect" label="Détecter la langue de l'appareil du client" on={c.region.autoDetect} hint="Le client peut toujours changer de langue avec le sélecteur en haut du site." />
          <fieldset className="sm:col-span-2">
            <legend className="label">Langues proposées aux clients</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <label key={code} className="flex items-center gap-2 text-sm"><input type="checkbox" name="languages" value={code} defaultChecked={c.region.languages.includes(code)} className="h-5 w-5" />{name}</label>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-600">Français et anglais sont traduits d'origine. Les autres langues sont traduites automatiquement (interface et carte) puis gardées en mémoire ; corrigez-les dans <Link href="/admin/traductions" className="underline">Traductions</Link>.</p>
          </fieldset>
        </Section>

        <Section title="Traduction automatique de la carte" hint="Traduit les noms et descriptions des plats, catégories et textes du site dans la langue du client. Sans service, seule l'interface est traduite.">
          <div>
            <label className="label" htmlFor="tp">Service</label>
            <select id="tp" name="translationProvider" defaultValue={c.translation.provider} className="input">
              <option value="none">Aucun</option>
              <option value="deepl">DeepL (recommandé)</option>
              <option value="google">Google Traduction</option>
              <option value="libretranslate">LibreTranslate (auto-hébergé)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tk">Clé API {c.translation.apiKeyEnc && <span className="font-normal text-green-700">— enregistrée</span>}</label>
            <input id="tk" name="translationApiKey" type="password" autoComplete="off" placeholder={c.translation.apiKeyEnc ? "•••••••• (laisser vide pour conserver)" : ""} className="input" />
            {c.translation.apiKeyEnc && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="translationClearKey" className="h-4 w-4" />Supprimer la clé enregistrée</label>}
          </div>
          <div className="sm:col-span-2"><label className="label" htmlFor="te">Adresse du serveur (LibreTranslate uniquement)</label><input id="te" name="translationEndpoint" type="url" defaultValue={c.translation.endpoint} className="input" placeholder="https://translate.example.com" /></div>
        </Section>

        <Section title="Catalogue" hint="Un élément par ligne. Un badge ou un taux utilisé par un produit ne peut pas être supprimé.">
          <div>
            <label className="label" htmlFor="bd">Badges — CODE;Libellé;#couleur</label>
            <textarea id="bd" name="badges" className="input min-h-44 font-mono text-sm" defaultValue={c.catalog.badges.map((b) => `${b.code};${b.label};${b.color}`).join("\n")} />
          </div>
          <div>
            <label className="label" htmlFor="vr">Taux de TVA — taux;Libellé</label>
            <textarea id="vr" name="vatRates" className="input min-h-44 font-mono text-sm" defaultValue={c.catalog.vatRates.map((v) => `${(v.value / 100).toString().replace(".", ",")};${v.label}`).join("\n")} />
          </div>
        </Section>

        <Section title="Clients">
          <Check name="accountsEnabled" label="Proposer les comptes clients (historique, adresses, recommander)" on={c.customers.accountsEnabled} hint="La commande sans compte reste toujours possible." />
        </Section>

        <div className="sticky bottom-4"><SubmitButton className="btn-primary text-lg shadow-lg">Enregistrer la configuration</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

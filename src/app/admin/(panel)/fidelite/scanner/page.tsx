import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { CardScanner } from "@/components/admin/CardScanner";
import { adminContext } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { createCardAction, findCardAction } from "../carte-actions";

export const metadata = { title: "Carte de fidélité" };

/** Comptoir : scanner une carte (appareil photo, scanner USB ou saisie), créer une carte. */
export default async function CardScannerPage() {
  await adminContext("orders.payment");
  const { loyalty } = await getConfig();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-5xl">Carte de fidélité</h1>
      {!loyalty.enabled && <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">La carte de fidélité est désactivée (rubrique Fidélité → Réglages).</p>}
      <section className="card grid gap-4 p-5">
        <h2 className="text-3xl">Retrouver un client</h2>
        <CardScanner />
        <ActionForm action={findCardAction} className="grid gap-2">
          <label className="label" htmlFor="q">Ou : n° de la carte, e-mail ou téléphone (un scanner de codes USB tape ici tout seul)</label>
          <div className="flex gap-2">
            <input id="q" name="q" autoFocus autoComplete="off" className="input font-mono" placeholder="2912 3456 7890" />
            <SubmitButton className="btn-primary" pendingLabel="…">OK</SubmitButton>
          </div>
        </ActionForm>
      </section>
      <details className="card p-5">
        <summary className="cursor-pointer font-display text-3xl">+ Nouvelle carte</summary>
        <p className="mt-2 text-sm text-neutral-700">Pour un client qui n'a pas encore de carte. Avec son e-mail, il retrouvera ses points en créant son compte sur le site (« mot de passe oublié »).</p>
        <ActionForm action={createCardAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="fn">Prénom</label><input id="fn" name="firstName" required autoComplete="off" className="input" /></div>
          <div><label className="label" htmlFor="ln">Nom</label><input id="ln" name="lastName" autoComplete="off" className="input" /></div>
          <div><label className="label" htmlFor="em">E-mail</label><input id="em" name="email" type="email" required autoComplete="off" className="input" /></div>
          <div><label className="label" htmlFor="ph">Téléphone</label><input id="ph" name="phone" type="tel" autoComplete="off" className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton pendingLabel="Création…">Créer la carte</SubmitButton></div>
        </ActionForm>
      </details>
    </div>
  );
}

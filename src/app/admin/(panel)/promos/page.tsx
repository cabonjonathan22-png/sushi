import { revalidatePath } from "next/cache";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext, authorize, logAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { euros, parseEuros } from "@/lib/money";
import { zonedTime } from "@/lib/time";

export const metadata = { title: "Codes promo" };

type Result = { ok?: string; error?: string } | undefined;

async function savePromo(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("promos.edit");
  const id = String(form.get("id") ?? "");
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: "Code : 3 à 30 lettres ou chiffres, sans espace." };
  const type = String(form.get("type"));
  if (!["AMOUNT", "PERCENT", "FREE_DELIVERY"].includes(type)) return { error: "Type invalide." };
  let value = 0;
  if (type === "AMOUNT") {
    const v = parseEuros(String(form.get("value") ?? ""));
    if (!v) return { error: "Montant de remise invalide." };
    value = v;
  } else if (type === "PERCENT") {
    value = Number(form.get("value"));
    if (!Number.isInteger(value) || value < 1 || value > 100) return { error: "Pourcentage entre 1 et 100." };
  }
  const min = parseEuros(String(form.get("min") ?? "0") || "0");
  if (min === null) return { error: "Minimum invalide." };
  const date = (k: string, end: boolean) => {
    const v = String(form.get(k) ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? zonedTime(v, end ? "23:59" : "00:00") : null;
  };
  const maxUses = String(form.get("maxUses") ?? "").trim() ? Number(form.get("maxUses")) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return { error: "Nombre d'utilisations invalide." };
  const data = {
    code, type: type as "AMOUNT", value, minSubtotalCents: min, startsAt: date("startsAt", false), endsAt: date("endsAt", true),
    maxUses, active: form.get("active") === "on", restaurantIds: form.getAll("restaurantIds").map(String),
  };
  const clash = await db.promoCode.findUnique({ where: { code } });
  if (clash && clash.id !== id) return { error: "Ce code existe déjà." };
  const p = id ? await db.promoCode.update({ where: { id }, data }) : await db.promoCode.create({ data });
  await logAction(staff, id ? "promo.update" : "promo.create", "PromoCode", p.id, null, data);
  revalidatePath("/admin/promos");
  return { ok: "Code enregistré." };
}

const describe = (p: { type: string; value: number }) =>
  p.type === "AMOUNT" ? `−${euros(p.value)}` : p.type === "PERCENT" ? `−${p.value} %` : "Livraison offerte";
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function PromosPage() {
  const { restaurants } = await adminContext("promos.edit");
  const promos = await db.promoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });

  const form = (p?: (typeof promos)[number]) => (
    <ActionForm action={savePromo} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!p}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div><label className="label">Code</label><input name="code" defaultValue={p?.code} required className="input uppercase" placeholder="BIENVENUE" /></div>
      <div><label className="label">Type</label>
        <select name="type" defaultValue={p?.type ?? "PERCENT"} className="input"><option value="PERCENT">Pourcentage</option><option value="AMOUNT">Montant (€)</option><option value="FREE_DELIVERY">Livraison offerte</option></select></div>
      <div><label className="label">Valeur (% ou €)</label><input name="value" defaultValue={p ? (p.type === "AMOUNT" ? (p.value / 100).toFixed(2).replace(".", ",") : String(p.value)) : "10"} className="input" /></div>
      <div><label className="label">Commande minimum (€)</label><input name="min" defaultValue={p ? (p.minSubtotalCents / 100).toFixed(2).replace(".", ",") : "0"} className="input" /></div>
      <div><label className="label">Valable du</label><input name="startsAt" type="date" defaultValue={day(p?.startsAt ?? null)} className="input" /></div>
      <div><label className="label">Au (inclus)</label><input name="endsAt" type="date" defaultValue={day(p?.endsAt ?? null)} className="input" /></div>
      <div><label className="label">Utilisations max (vide = illimité)</label><input name="maxUses" type="number" min={1} defaultValue={p?.maxUses ?? ""} className="input" /></div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Restaurants (aucun coché = tous)</legend>
        <div className="flex flex-wrap gap-3">{restaurants.map((r) => <label key={r.id} className="flex items-center gap-2"><input type="checkbox" name="restaurantIds" value={r.id} defaultChecked={p?.restaurantIds.includes(r.id)} className="h-5 w-5" />{r.name}</label>)}</div>
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-5 w-5" />Actif</label>
      <div className="sm:col-span-3"><SubmitButton>{p ? "Enregistrer" : "Créer le code"}</SubmitButton></div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-5xl">Codes promo</h1>
      <section className="card p-5"><h2 className="mb-3 text-3xl">Nouveau code</h2>{form()}</section>
      {promos.map((p) => (
        <details key={p.id} className="card p-5">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
            <span className="font-display text-3xl">{p.code}</span>
            <span className="chip bg-brand-100">{describe(p)}</span>
            {!p.active && <span className="chip bg-neutral-200">inactif</span>}
            <span className="text-sm text-neutral-600">utilisé {p.usedCount} fois{p.maxUses ? ` / ${p.maxUses}` : ""}{p.minSubtotalCents ? ` · dès ${euros(p.minSubtotalCents)}` : ""}{p.endsAt ? ` · jusqu'au ${p.endsAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}</span>
          </summary>
          <div className="mt-4">{form(p)}</div>
        </details>
      ))}
    </div>
  );
}

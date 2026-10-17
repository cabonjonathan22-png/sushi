import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminRestaurant, authorize, logAction } from "@/lib/admin";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/seo";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "API & webhooks" };

type Result = { ok?: string; error?: string } | undefined;
const EVENTS = [["order.created", "Nouvelle commande"], ["order.status_changed", "Changement de statut"]] as const;

async function createKey(_: Result, form: FormData): Promise<Result> {
  "use server";
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("tech.config", restaurantId);
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "Clé API";
  const key = `ysk_${randomBytes(24).toString("base64url")}`;
  const k = await db.apiKey.create({ data: { restaurantId, name, prefix: key.slice(0, 12), hash: sha256(key) } });
  await logAction(staff, "apikey.create", "ApiKey", k.id, restaurantId, { name });
  revalidatePath("/admin/api");
  return { ok: `Clé créée — copiez-la maintenant, elle ne sera plus affichée : ${key}` };
}

async function revokeKey(form: FormData) {
  "use server";
  const k = await db.apiKey.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("tech.config", k.restaurantId);
  await db.apiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
  await logAction(staff, "apikey.revoke", "ApiKey", k.id, k.restaurantId);
  revalidatePath("/admin/api");
}

async function saveWebhook(_: Result, form: FormData): Promise<Result> {
  "use server";
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("tech.config", restaurantId);
  const url = String(form.get("url") ?? "").trim();
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && process.env.NODE_ENV === "production") return { error: "L'adresse doit commencer par https://" };
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) && process.env.NODE_ENV === "production") return { error: "Adresse interne refusée." };
  } catch {
    return { error: "Adresse invalide." };
  }
  const events = form.getAll("events").map(String).filter((e) => EVENTS.some(([k]) => k === e));
  if (!events.length) return { error: "Choisissez au moins un événement." };
  const secret = `whsec_${randomToken(24)}`;
  const w = await db.webhookEndpoint.create({ data: { restaurantId, url, events, secret } });
  await logAction(staff, "webhook.create", "WebhookEndpoint", w.id, restaurantId, { url, events });
  revalidatePath("/admin/api");
  return { ok: `Webhook créé. Secret de signature (à copier maintenant) : ${secret}` };
}

async function toggleWebhook(form: FormData) {
  "use server";
  const w = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  const staff = await authorize("tech.config", w.restaurantId);
  if (form.get("delete") === "1") await db.webhookEndpoint.delete({ where: { id: w.id } });
  else await db.webhookEndpoint.update({ where: { id: w.id }, data: { active: !w.active } });
  await logAction(staff, "webhook.update", "WebhookEndpoint", w.id, w.restaurantId, { deleted: form.get("delete") === "1" });
  revalidatePath("/admin/api");
}

export default async function ApiPage() {
  const { current } = await adminRestaurant("tech.config");
  const [keys, hooks, failing] = await Promise.all([
    db.apiKey.findMany({ where: { restaurantId: current.id }, orderBy: { createdAt: "desc" } }),
    db.webhookEndpoint.findMany({ where: { restaurantId: current.id }, orderBy: { createdAt: "desc" } }),
    db.outboxJob.count({ where: { type: "webhook", doneAt: null, attempts: { gt: 0 } } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-5xl">API & webhooks — {current.name}</h1>
      <p className="text-neutral-700">
        Pour connecter une caisse, un service de livraison ou un outil externe. Documentation :{" "}
        <Link href="/api/v1/docs" target="_blank" className="font-semibold underline">{appUrl()}/api/v1/docs</Link>
      </p>

      <section className="card p-5">
        <h2 className="text-3xl">Clés API</h2>
        <p className="text-sm text-neutral-600">En-tête <code>Authorization: Bearer ysk_…</code>. Une clé ne donne accès qu'aux données de ce restaurant.</p>
        <ul className="my-3 divide-y">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><strong>{k.name}</strong> · <code>{k.prefix}…</code> · créée le {formatDateTime(k.createdAt)}{k.lastUsedAt && ` · utilisée le ${formatDateTime(k.lastUsedAt)}`}</span>
              {k.revokedAt ? <span className="chip bg-neutral-200">révoquée</span> : (
                <form action={revokeKey}><input type="hidden" name="id" value={k.id} /><button className="text-sm text-red-700 underline">Révoquer</button></form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={createKey} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="restaurantId" value={current.id} />
          <div className="flex-1"><label className="label" htmlFor="kn">Nom (ex. « Caisse »)</label><input id="kn" name="name" className="input" /></div>
          <SubmitButton>Créer une clé</SubmitButton>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-3xl">Webhooks sortants</h2>
        <p className="text-sm text-neutral-600">
          Nous envoyons un POST JSON signé (en-tête <code>X-Yaoma-Signature: t=…,v1=HMAC-SHA256</code>), relancé automatiquement en cas d'échec.
          {failing > 0 && <strong className="text-red-700"> {failing} envoi(s) en échec, en cours de relance.</strong>}
        </p>
        <ul className="my-3 divide-y">
          {hooks.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="break-all"><strong>{w.url}</strong> · {w.events.join(", ")}{!w.active && " · INACTIF"}</span>
              <span className="flex gap-3">
                <form action={toggleWebhook}><input type="hidden" name="id" value={w.id} /><button className="text-sm underline">{w.active ? "Désactiver" : "Activer"}</button></form>
                <form action={toggleWebhook}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="delete" value="1" /><button className="text-sm text-red-700 underline">Supprimer</button></form>
              </span>
            </li>
          ))}
        </ul>
        <ActionForm action={saveWebhook} className="grid gap-3">
          <input type="hidden" name="restaurantId" value={current.id} />
          <div><label className="label" htmlFor="wu">Adresse (https://…)</label><input id="wu" name="url" required className="input" /></div>
          <div className="flex flex-wrap gap-4">{EVENTS.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="events" value={k} defaultChecked className="h-5 w-5" />{l}</label>)}</div>
          <SubmitButton>Ajouter le webhook</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}

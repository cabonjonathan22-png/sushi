import { revalidatePath } from "next/cache";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { OfferItemsEditor } from "@/components/admin/OfferItemsEditor";
import { loadMenu } from "@/lib/menu";
import { adminContext, authorize, logAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { imageSources, storeProductImage, type ImageFiles } from "@/lib/images";
import { euros } from "@/lib/money";
import { offerWhen, parseItems, WEEKDAY_LABELS } from "@/lib/offer-rules";
import { localDate, zonedTime } from "@/lib/time";

export const metadata = { title: "Offres" };

type Result = { ok?: string; error?: string } | undefined;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function saveOffer(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("promos.edit");
  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  if (!title) return { error: "Donnez un titre à l'offre (ex. « Happy Box »)." };
  let items;
  try {
    items = parseItems(JSON.parse(String(form.get("items") ?? "[]")));
  } catch {
    return { error: "Liste des produits illisible : rechargez la page." };
  }
  if (items.length > 100) return { error: "100 produits maximum par offre." };
  const date = (k: string, end: boolean) => {
    const v = String(form.get(k) ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? zonedTime(v, end ? "23:59" : "00:00") : null;
  };
  const timeFrom = String(form.get("timeFrom") ?? "");
  const timeTo = String(form.get("timeTo") ?? "");
  if ((timeFrom && !HHMM.test(timeFrom)) || (timeTo && !HHMM.test(timeTo))) return { error: "Heures au format 11:00." };
  const weekdays = form.getAll("weekdays").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  let imageId: string | null | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return { error: "Image trop lourde (15 Mo maximum)." };
    imageId = await storeProductImage(Buffer.from(await file.arrayBuffer()), file.name);
  } else if (form.get("removeImage") === "on") imageId = null;

  const data = {
    title, badge: String(form.get("badge") ?? "").trim().slice(0, 60), description: String(form.get("description") ?? "").trim().slice(0, 1000),
    items: items as unknown as object, zoneIds: form.getAll("zoneIds").map(String), weekdays, startsAt: date("startsAt", false), endsAt: date("endsAt", true), timeFrom, timeTo,
    restaurantIds: form.getAll("restaurantIds").map(String), active: form.get("active") === "on", showOnHome: form.get("showOnHome") === "on",
    sortOrder: Number(form.get("sortOrder") ?? 0) || 0, ...(imageId !== undefined ? { imageId } : {}),
  };
  const o = id ? await db.offer.update({ where: { id }, data }) : await db.offer.create({ data });
  await logAction(staff, id ? "offer.update" : "offer.create", "Offer", o.id, null, { ...data, imageId: o.imageId });
  revalidatePath("/admin/offres");
  revalidatePath("/");
  return { ok: "Offre enregistrée." };
}

async function toggleOffer(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("promos.edit");
  const o = await db.offer.update({ where: { id: String(form.get("id")) }, data: { active: form.get("active") === "1" } });
  await logAction(staff, o.active ? "offer.enable" : "offer.disable", "Offer", o.id, null, { title: o.title });
  revalidatePath("/admin/offres");
  return { ok: o.active ? "Offre activée." : "Offre désactivée." };
}

async function deleteOffer(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("promos.edit");
  const o = await db.offer.delete({ where: { id: String(form.get("id")) } });
  await logAction(staff, "offer.delete", "Offer", o.id, null, { title: o.title });
  revalidatePath("/admin/offres");
  return { ok: "Offre supprimée." };
}

export default async function OffersPage() {
  const { restaurants, current } = await adminContext("promos.edit");
  const [offers, menu, zones] = await Promise.all([
    db.offer.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }),
    // Prix réels (surcharges du restaurant comprises), sans offre.
    current ? loadMenu(current.id, { includeHidden: true, noOffers: true }) : Promise.resolve({ products: [], categories: [] }),
    db.deliveryZone.findMany({ orderBy: [{ restaurantId: "asc" }, { name: "asc" }], include: { areas: { select: { city: true } }, restaurant: { select: { name: true } } } }),
  ]);
  const products = [...menu.products].sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, variants: p.variants.map((v) => ({ id: v.id, label: v.label, priceCents: v.priceCents })) }));
  const imgs = new Map((await db.image.findMany({ where: { id: { in: offers.flatMap((o) => (o.imageId ? [o.imageId] : [])) } } })).map((i) => [i.id, i.files as ImageFiles]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const day = (d: Date | null) => (d ? localDate(d) : "");

  const form = (o?: (typeof offers)[number]) => (
    <ActionForm action={saveOffer} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!o}>
      <input type="hidden" name="id" value={o?.id ?? ""} />
      <div><label className="label">Titre</label><input name="title" defaultValue={o?.title} required className="input" placeholder="Happy Box" /></div>
      <div><label className="label">Bandeau (facultatif)</label><input name="badge" defaultValue={o?.badge} className="input" placeholder="Offre du mardi" /></div>
      <div className="sm:col-span-2"><label className="label">Texte (contenu, conditions…)</label>
        <textarea name="description" defaultValue={o?.description} rows={3} className="input" placeholder={"3 sushis saumon, 3 sushis thon rouge, 6 makis…"} /></div>
      <OfferItemsEditor products={products} initial={o ? parseItems(o.items) : []} />
      <div><label className="label">Ordre d&apos;affichage</label><input name="sortOrder" type="number" defaultValue={o?.sortOrder ?? 0} className="input" /></div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Jours (aucun coché = tous les jours)</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="flex items-center gap-2"><input type="checkbox" name="weekdays" value={d} defaultChecked={o?.weekdays.includes(d)} className="h-5 w-5" />{WEEKDAY_LABELS[d]}</label>
          ))}
        </div>
      </fieldset>
      <div><label className="label">Du (facultatif, ex. Noël)</label><input name="startsAt" type="date" defaultValue={day(o?.startsAt ?? null)} className="input" /></div>
      <div><label className="label">Au (inclus)</label><input name="endsAt" type="date" defaultValue={day(o?.endsAt ?? null)} className="input" /></div>
      <div><label className="label">De (heure, facultatif)</label><input name="timeFrom" type="time" defaultValue={o?.timeFrom} className="input" /></div>
      <div><label className="label">À (heure)</label><input name="timeTo" type="time" defaultValue={o?.timeTo} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">Affiche / photo (sinon la photo du produit)</label>
        <input name="image" type="file" accept="image/*" className="input" />
        {o?.imageId && <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" className="h-4 w-4" />Retirer l&apos;affiche</label>}</div>
      {zones.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="label">Zones de livraison (aucune cochée = partout, en retrait, livraison et sur place)</legend>
          <div className="flex flex-wrap gap-3">{zones.map((z) => (
            <label key={z.id} className="flex items-center gap-2"><input type="checkbox" name="zoneIds" value={z.id} defaultChecked={o?.zoneIds.includes(z.id)} className="h-5 w-5" />
              {z.name}{restaurants.length > 1 ? ` (${z.restaurant.name})` : ""} <span className="text-xs text-neutral-500">{z.areas.map((a) => a.city).join(", ")}</span></label>
          ))}</div>
          <p className="mt-1 text-xs text-neutral-500">Avec une zone cochée, l&apos;offre ne s&apos;applique qu&apos;aux livraisons dans cette zone.</p>
        </fieldset>
      )}
      {restaurants.length > 1 && (
        <fieldset className="sm:col-span-2">
          <legend className="label">Restaurants (aucun coché = tous)</legend>
          <div className="flex flex-wrap gap-3">{restaurants.map((r) => <label key={r.id} className="flex items-center gap-2"><input type="checkbox" name="restaurantIds" value={r.id} defaultChecked={o?.restaurantIds.includes(r.id)} className="h-5 w-5" />{r.name}</label>)}</div>
        </fieldset>
      )}
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={o?.active ?? true} className="h-5 w-5" />Active</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="showOnHome" defaultChecked={o?.showOnHome ?? true} className="h-5 w-5" />Affichée sur l&apos;accueil</label>
      <div className="sm:col-span-2"><SubmitButton>{o ? "Enregistrer" : "Créer l'offre"}</SubmitButton></div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-5xl">Offres</h1>
      <p className="text-neutral-600">
        Offres du moment : prix spécial sur un produit (« Happy Box à 24,90 € au lieu de 35,90 € ») et/ou simple annonce, certains jours,
        sur une période (Noël…) ou à certaines heures. Elles s&apos;affichent sur l&apos;accueil et en haut de la carte, et le prix s&apos;applique
        tout seul à la commande (selon le jour du créneau choisi). Une offre se désactive d&apos;un clic.
      </p>
      <section className="card p-5"><h2 className="mb-3 text-3xl">Nouvelle offre</h2>{form()}</section>
      {offers.map((o) => {
        const items = parseItems(o.items);
        const img = o.imageId ? imageSources(imgs.get(o.imageId), 320) : null;
        return (
          <details key={o.id} className="card p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
              {img && <img src={img.src} alt="" className="h-14 w-14 rounded-lg object-cover" />}
              <span className="font-display text-3xl">{o.title}</span>
              {o.badge && <span className="chip bg-brand-100">{o.badge}</span>}
              {items.slice(0, 3).map((i) => {
                const p = byId.get(i.productId);
                const reg = (i.variantId ? p?.variants.find((v) => v.id === i.variantId)?.priceCents : p?.priceCents) ?? null;
                return <span key={`${i.productId}${i.variantId ?? ""}`} className="chip bg-green-100 text-green-900">{p?.name ?? "?"} {euros(i.priceCents)}{reg !== null && reg !== i.priceCents ? ` (au lieu de ${euros(reg)})` : ""}</span>;
              })}
              {items.length > 3 && <span className="chip bg-green-100 text-green-900">+{items.length - 3} produits</span>}
              {o.zoneIds.length > 0 && <span className="chip bg-sky-100 text-sky-900">{o.zoneIds.length} zone{o.zoneIds.length > 1 ? "s" : ""}</span>}
              <span className={`chip ${o.active ? "bg-green-600 text-white" : "bg-neutral-200"}`}>{o.active ? "active" : "désactivée"}</span>
              <span className="text-sm text-neutral-600">{offerWhen(o)}</span>
            </summary>
            <div className="mt-4 flex flex-wrap gap-3">
              <ActionForm action={toggleOffer}>
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="active" value={o.active ? "0" : "1"} />
                <SubmitButton className={o.active ? "btn-ghost" : "btn"}>{o.active ? "Désactiver" : "Activer"}</SubmitButton>
              </ActionForm>
              <ActionForm action={deleteOffer} confirm={`Supprimer l'offre « ${o.title} » ?`}>
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton className="btn-ghost text-red-700">Supprimer</SubmitButton>
              </ActionForm>
            </div>
            <div className="mt-4">{form(o)}</div>
          </details>
        );
      })}
    </div>
  );
}

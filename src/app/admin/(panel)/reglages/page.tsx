import { revalidatePath } from "next/cache";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext, authorize, logAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { storeProductImage } from "@/lib/images";
import { getSiteSettings } from "@/lib/restaurants";

export const metadata = { title: "Réglages du site" };

type Result = { ok?: string; error?: string } | undefined;
const LEGAL = ["companyName", "legalForm", "shareCapital", "siret", "vatNumber", "rcs", "publisherName", "contactEmail", "hostName", "hostAddress"] as const;

async function saveSettings(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("tech.config");
  const current = await db.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
  const content = (current.content ?? {}) as Record<string, unknown>;
  const file = form.get("heroImage");
  let heroImageId = content.heroImageId as string | null | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      heroImageId = await storeProductImage(Buffer.from(await file.arrayBuffer()), file.name, { banner: true });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const data = {
    brandName: str("brandName", 60) || "Mon restaurant",
    extrasLabel: str("extrasLabel", 40) || "Les petits plus",
    ...Object.fromEntries(LEGAL.map((k) => [k, str(k, 200)])),
    content: {
      heroTitle: str("heroTitle", 80), heroTagline: str("heroTagline", 200), intro: str("intro", 1500), commitment: str("commitment", 1500), heroImageId,
    },
  };
  await db.siteSettings.update({ where: { id: 1 }, data });
  await logAction(staff, "settings.update", "SiteSettings", "1", null, { ...data, content: undefined });
  revalidatePath("/", "layout");
  return { ok: "Réglages enregistrés." };
}

export default async function SettingsPage() {
  await adminContext("tech.config");
  const s = await getSiteSettings();
  const field = (k: (typeof LEGAL)[number], label: string) => (
    <div><label className="label" htmlFor={k}>{label}</label><input id={k} name={k} defaultValue={s[k]} className="input" /></div>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-5xl">Réglages du site</h1>
      <ActionForm action={saveSettings} className="space-y-6">
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-3xl sm:col-span-2">Identité</h2>
          <div><label className="label" htmlFor="brand">Nom de l'enseigne</label><input id="brand" name="brandName" defaultValue={s.brandName} className="input" /></div>
          <div><label className="label" htmlFor="extras">Nom de la catégorie des suppléments</label><input id="extras" name="extrasLabel" defaultValue={s.extrasLabel} className="input" /></div>
        </section>
        <section className="card grid gap-4 p-5">
          <h2 className="text-3xl">Page d'accueil</h2>
          <div><label className="label" htmlFor="ht">Sur-titre</label><input id="ht" name="heroTitle" defaultValue={s.content.heroTitle} className="input" /></div>
          <div><label className="label" htmlFor="tg">Accroche</label><input id="tg" name="heroTagline" defaultValue={s.content.heroTagline} className="input" /></div>
          <div><label className="label" htmlFor="in">Présentation</label><textarea id="in" name="intro" defaultValue={s.content.intro} className="input min-h-28" /></div>
          <div><label className="label" htmlFor="cm">Notre engagement</label><textarea id="cm" name="commitment" defaultValue={s.content.commitment} className="input min-h-28" /></div>
          <div><label className="label" htmlFor="hi">Nouvelle photo d'en-tête (facultatif)</label><input id="hi" name="heroImage" type="file" accept="image/*" className="block text-sm" /></div>
        </section>
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-3xl sm:col-span-2">Mentions légales</h2>
          <p className="text-sm text-neutral-600 sm:col-span-2">Utilisées dans les pages Mentions légales, CGV et Confidentialité.</p>
          {field("companyName", "Raison sociale")}
          {field("legalForm", "Forme juridique (SARL, SAS…)")}
          {field("shareCapital", "Capital social")}
          {field("siret", "SIRET")}
          {field("rcs", "RCS (ville)")}
          {field("vatNumber", "N° de TVA intracommunautaire")}
          {field("publisherName", "Directeur de la publication")}
          {field("contactEmail", "E-mail de contact (RGPD)")}
          {field("hostName", "Hébergeur")}
          {field("hostAddress", "Adresse de l'hébergeur")}
        </section>
        <SubmitButton className="btn-primary text-lg">Enregistrer</SubmitButton>
      </ActionForm>
    </div>
  );
}

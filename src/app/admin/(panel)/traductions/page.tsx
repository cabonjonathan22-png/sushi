import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { LANGUAGES } from "@/i18n/languages";
import { adminContext } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { sourceHash } from "@/lib/translate";
import { pretranslateAction, saveTranslationsAction } from "./actions";
import { translationSources, type Group } from "./sources";

export const metadata = { title: "Traductions" };

const TABS: { id: Group; label: string }[] = [
  { id: "menu", label: "Carte" },
  { id: "site", label: "Textes du site" },
  { id: "ui", label: "Interface" },
];

type Props = { searchParams: Promise<{ langue?: string; onglet?: string; q?: string; filtre?: string }> };

/** Traductions : vérifier et corriger ce que la traduction automatique a produit. */
export default async function TranslationsPage({ searchParams }: Props) {
  await adminContext("tech.config");
  const sp = await searchParams;
  const config = await getConfig();
  const targets = config.region.languages.filter((l) => l !== config.region.defaultLocale);
  const locale = targets.includes(sp.langue ?? "") ? sp.langue! : targets[0];
  const tabs = TABS.filter((t) => t.id !== "ui" || (locale !== "fr" && locale !== "en"));
  const group = (tabs.find((t) => t.id === sp.onglet)?.id ?? "menu") as Group;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = sp.filtre ?? "";

  if (!locale) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-5xl">Traductions</h1>
        <p className="card mt-4 p-5">Aucune autre langue n'est proposée aux clients. Ajoutez-en dans <Link href="/admin/configuration" className="underline">Configuration → Pays, devise et langues</Link>.</p>
      </div>
    );
  }

  const { items } = await translationSources(group);
  const rows = await db.translation.findMany({ where: { locale, entityType: { in: [...new Set(items.map((i) => i.entityType))] } } });
  const byKey = new Map(rows.map((r) => [`${r.entityType}|${r.entityId}|${r.field}`, r]));
  const list = items
    .filter((i) => i.text.trim())
    .map((i) => {
      const key = `${i.entityType}|${i.entityId}|${i.field}`;
      const row = byKey.get(key);
      const state: "missing" | "manual" | "outdated" | "auto" = !row ? "missing" : row.source === "MANUAL" ? "manual" : row.sourceHash !== sourceHash(i.text) ? "outdated" : "auto";
      return { ...i, key, row, state };
    })
    .filter((i) => !q || i.text.toLowerCase().includes(q) || i.context.toLowerCase().includes(q) || i.row?.text.toLowerCase().includes(q))
    .filter((i) => !filter || (filter === "todo" ? i.state === "missing" || i.state === "outdated" : i.state === filter));
  const counts = { missing: 0, outdated: 0, auto: 0, manual: 0 };
  for (const i of items.filter((x) => x.text.trim())) {
    const row = byKey.get(`${i.entityType}|${i.entityId}|${i.field}`);
    counts[!row ? "missing" : row.source === "MANUAL" ? "manual" : row.sourceHash !== sourceHash(i.text) ? "outdated" : "auto"]++;
  }
  const STATE = {
    missing: { label: "Non traduit", cls: "bg-red-100 text-red-800" },
    outdated: { label: "Original modifié", cls: "bg-amber-100 text-amber-900" },
    auto: { label: "Automatique", cls: "bg-neutral-100 text-neutral-700" },
    manual: { label: "Corrigé", cls: "bg-green-100 text-green-800" },
  } as const;
  const href = (p: Record<string, string>) => `/admin/traductions?${new URLSearchParams({ langue: locale, onglet: group, ...(q ? { q } : {}), ...(filter ? { filtre: filter } : {}), ...p })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-5xl">Traductions</h1>
        <p className="text-neutral-700">
          Le site s'affiche dans la langue de l'appareil du client. La carte et les textes sont traduits automatiquement
          ({config.translation.provider === "none" ? <strong className="text-red-700">aucun service choisi</strong> : <strong>{config.translation.provider}</strong>} —{" "}
          <Link href="/admin/configuration" className="underline">Configuration</Link>). Corrigez ici une traduction : elle ne sera plus jamais remplacée. Videz un champ pour revenir à la traduction automatique.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Langue">
          {targets.map((l) => (
            <Link key={l} href={`/admin/traductions?langue=${l}&onglet=${group}`} aria-current={l === locale ? "page" : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${l === locale ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
              {LANGUAGES[l] ?? l}
            </Link>
          ))}
        </div>
        <ActionForm action={pretranslateAction} className="ms-auto">
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton className="btn-dark">Tout traduire en {LANGUAGES[locale] ?? locale}</SubmitButton>
        </ActionForm>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link key={t.id} href={`/admin/traductions?langue=${locale}&onglet=${t.id}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${t.id === group ? "bg-brand-600 text-white" : "bg-white ring-1 ring-neutral-300"}`}>{t.label}</Link>
        ))}
        <span className="mx-2 h-6 w-px bg-neutral-300" />
        <Link href={href({ filtre: "" })} className={`chip px-3 py-1 ${!filter ? "bg-ink text-white" : "bg-neutral-100"}`}>Tout ({Object.values(counts).reduce((a, b) => a + b, 0)})</Link>
        <Link href={href({ filtre: "todo" })} className={`chip px-3 py-1 ${filter === "todo" ? "bg-ink text-white" : "bg-amber-100"}`}>À faire ({counts.missing + counts.outdated})</Link>
        <Link href={href({ filtre: "manual" })} className={`chip px-3 py-1 ${filter === "manual" ? "bg-ink text-white" : "bg-green-100"}`}>Corrigées ({counts.manual})</Link>
        <form className="ms-auto" action="/admin/traductions">
          <input type="hidden" name="langue" value={locale} /><input type="hidden" name="onglet" value={group} />
          <label className="sr-only" htmlFor="tq">Rechercher</label>
          <input id="tq" name="q" defaultValue={sp.q} placeholder="Rechercher…" className="input min-h-10 w-56" />
        </form>
      </div>

      <ActionForm action={saveTranslationsAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="group" value={group} />
        <div className="card divide-y">
          {list.length === 0 && <p className="p-5 text-neutral-600">Rien à afficher.</p>}
          {list.map((i) => (
            <div key={i.key} className="grid gap-3 p-4 md:grid-cols-2">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className={`chip ${STATE[i.state].cls}`}>{STATE[i.state].label}</span>{i.context}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{i.text}</p>
              </div>
              <div>
                <label className="sr-only" htmlFor={`t-${i.key}`}>Traduction ({LANGUAGES[locale] ?? locale})</label>
                <input type="hidden" name={`was:${i.key}`} value={i.row?.text ?? ""} />
                {i.text.length > 80
                  ? <textarea id={`t-${i.key}`} name={`tr:${i.key}`} defaultValue={i.row?.text ?? ""} rows={3} className="input text-sm" dir="auto" />
                  : <input id={`t-${i.key}`} name={`tr:${i.key}`} defaultValue={i.row?.text ?? ""} className="input text-sm" dir="auto" />}
              </div>
            </div>
          ))}
        </div>
        {list.length > 0 && <div className="sticky bottom-4"><SubmitButton className="btn-primary text-lg shadow-lg">Enregistrer les corrections</SubmitButton></div>}
      </ActionForm>
    </div>
  );
}

/** Mise en page commune des pages légales (texte lisible, titres clairs). */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 leading-relaxed [&_h2]:mt-8 [&_h2]:text-3xl [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-2">
      <h1 className="text-5xl">{title}</h1>
      {updated && <p className="text-sm text-neutral-600">Mise à jour : {updated}</p>}
      {children}
    </article>
  );
}

/** Valeur légale à compléter dans « Réglages du site » si absente. */
export function V({ v }: { v?: string }) {
  return v ? <>{v}</> : <mark className="bg-amber-100 px-1">[à compléter dans le back-office]</mark>;
}

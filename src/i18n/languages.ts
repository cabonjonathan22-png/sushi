/** Langues proposables (nom dans la langue elle-même) ; sens d'écriture droite → gauche. */
export const LANGUAGES: Record<string, string> = {
  fr: "Français", en: "English", es: "Español", de: "Deutsch", it: "Italiano", pt: "Português", nl: "Nederlands",
  pl: "Polski", ro: "Română", cs: "Čeština", sv: "Svenska", da: "Dansk", fi: "Suomi", no: "Norsk", el: "Ελληνικά",
  hu: "Magyar", bg: "Български", uk: "Українська", ru: "Русский", tr: "Türkçe", ar: "العربية", he: "עברית",
  zh: "中文", ja: "日本語", ko: "한국어", hi: "हिन्दी", id: "Bahasa Indonesia", th: "ไทย", vi: "Tiếng Việt", ms: "Bahasa Melayu",
};

export const RTL = new Set(["ar", "he", "fa", "ur"]);

/** Langue la plus proche dans la liste, d'après l'en-tête Accept-Language du navigateur. */
export function matchAcceptLanguage(header: string | null, available: string[]): string | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0]!, q: q ? Number(q) : 1 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.find((w) => available.includes(w.lang))?.lang ?? null;
}

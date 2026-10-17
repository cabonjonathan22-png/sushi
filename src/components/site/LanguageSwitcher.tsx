"use client";

import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/i18n/languages";

/** Choix de la langue : mémorisé un an (cookie), prioritaire sur la langue de l'appareil. */
export function LanguageSwitcher({ current, languages, label, tone = "light" }: { current: string; languages: string[]; label: string; tone?: "light" | "dark" }) {
  const router = useRouter();
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        onChange={(e) => {
          document.cookie = `ys_lang=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
        className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-semibold ${tone === "dark" ? "bg-white/10 text-white" : "border border-line bg-transparent text-char hover:bg-linen"}`}
      >
        {languages.map((l) => (
          <option key={l} value={l} className="text-ink">{l.toUpperCase()} · {LANGUAGES[l] ?? l}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { createContext, useContext, useMemo } from "react";
import { setMoneyFormat } from "@/lib/money";
import type { Dictionary, MessageKey } from "./fr";

interface I18n {
  locale: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

/**
 * Fournit la langue et les textes aux composants du navigateur.
 * La devise est fixée ici (avant le rendu des enfants) pour l'affichage des prix.
 */
export function I18nProvider({ locale, dict, currency, moneyLocale, children }: {
  locale: string;
  dict: Dictionary;
  currency: string;
  moneyLocale: string;
  children: React.ReactNode;
}) {
  setMoneyFormat(currency, moneyLocale);
  const value = useMemo<I18n>(() => ({
    locale,
    t: (key, vars) => {
      const s = dict[key] ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)) : s;
    },
  }), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n doit être utilisé sous <I18nProvider>");
  return v;
}

/** Libellé d'une erreur renvoyée par le serveur (code + paramètres), dans la langue du client. */
export function errorText(t: I18n["t"], e: { code?: string; message: string; params?: Record<string, string | number> }): string {
  const key = `err.${e.code}` as MessageKey;
  const s = t(key, e.params);
  return s === key ? e.message : s;
}

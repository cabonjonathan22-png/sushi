"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Le site n'utilise que des cookies strictement nécessaires (session, panier, langue) :
 * aucun consentement n'est requis (CNIL), mais on en informe le visiteur une fois.
 * Si un outil de mesure d'audience est ajouté plus tard, ce bandeau devra recueillir le consentement.
 */
export function CookieNotice() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem("ys_cookie_notice") !== "1");
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem("ys_cookie_notice", "1");
    } catch { /* stockage indisponible */ }
    setShow(false);
  };
  return (
    <div role="region" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl bg-white p-4 text-sm text-ink shadow-2xl ring-1 ring-black/10">
      <p>{t("cookie.text")} <Link href="/cookies" className="underline">{t("cookie.more")}</Link></p>
      <button type="button" onClick={close} className="btn-dark mt-3 min-h-10 w-full sm:w-auto">{t("cookie.ok")}</button>
    </div>
  );
}

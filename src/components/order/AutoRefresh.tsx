"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Rafraîchit la page (statut de commande) à intervalle régulier, seulement si l'onglet est visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

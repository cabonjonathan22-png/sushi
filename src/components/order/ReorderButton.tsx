"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { itemKey, useCart } from "./cart-store";

/** « Commander à nouveau » : remet les mêmes produits dans le panier (prix et disponibilités actuels). */
export function ReorderButton({ slug, lines, className = "btn-primary" }: {
  slug: string;
  lines: { productId: string; variantId: string | null; optionIds: string[]; quantity: number }[];
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const cart = useCart(slug);
  if (!lines.length) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        cart.replace(lines.map((l) => ({ ...l, key: itemKey(l.productId, l.variantId, l.optionIds) })));
        router.push(`/commander/${slug}/valider`);
      }}
    >
      {t("track.reorder")}
    </button>
  );
}

import { badgeTextColor, type BadgeDef } from "@/lib/config-schema";

/** Badge produit (Végétarien, Épicé…) — couleurs définies dans la Configuration. */
export function BadgeChip({ code, badges }: { code: string; badges: BadgeDef[] }) {
  const b = badges.find((x) => x.code === code);
  if (!b) return null;
  return <span className="chip" style={{ backgroundColor: b.color, color: badgeTextColor(b.color) }}>{b.label}</span>;
}

import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { slotCounts } from "@/lib/orders/place";
import { computeSlots, isPaused } from "@/lib/slots";
import { getI18n } from "@/i18n/server";
import { localDate, relativeDay } from "@/lib/time";

/** Créneaux disponibles : GET /api/restaurants/<slug>/slots?mode=PICKUP|DELIVERY|DINE_IN&zone=<id> */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "PICKUP";
  const zoneId = url.searchParams.get("zone");
  const r = await db.restaurant.findFirst({
    where: { slug, active: true },
    include: { openingHours: true, closures: true, zones: { where: { active: true } } },
  });
  if (!r) return json({ error: "Restaurant introuvable" }, 404);
  const now = new Date();
  if (isPaused(r, now)) return json({ paused: true, reason: r.ordersPausedReason, days: [] });

  const zone = mode === "DELIVERY" ? r.zones.find((z) => z.id === zoneId) : null;
  if (mode === "DELIVERY" && !zone) return json({ paused: false, days: [], needZone: true });

  const days = computeSlots({
    now, settings: r, hours: r.openingHours, closures: r.closures,
    extraMinutes: zone?.etaMinutes ?? 0, taken: await slotCounts(r.id, now),
  });
  const today = localDate(now, r.timezone);
  const { t, locale } = await getI18n();
  const labels = { locale, today: t("time.today"), tomorrow: t("time.tomorrow") };
  return json({
    paused: false,
    days: days.map((d) => ({
      date: d.date,
      label: relativeDay(d.date, today, labels),
      slots: d.slots.map((s) => ({ start: s.start.toISOString(), label: s.label, period: s.period, full: s.full })),
    })),
  });
}

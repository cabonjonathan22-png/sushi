"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_RESTAURANT_COOKIE, authorize, logAction } from "@/lib/admin";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canAccessRestaurant } from "@/lib/permissions";
import { INDEFINITE } from "@/lib/pause";
import { addDays, localDate, zonedTime } from "@/lib/time";

export async function switchRestaurantAction(form: FormData) {
  const staff = await requireStaff();
  const id = String(form.get("restaurantId") ?? "");
  if (!canAccessRestaurant(staff.actor, id)) return;
  (await cookies()).set(ADMIN_RESTAURANT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.NODE_ENV === "production", maxAge: 31536000 });
  revalidatePath("/admin", "layout");
}

/**
 * Fermer les commandes en ligne d'un restaurant (pause) : pendant la pause, aucun créneau n'est
 * proposé, quel que soit le jour. Durées : quelques minutes, la journée, jusqu'à une date incluse,
 * ou jusqu'à nouvel ordre. « reopen » rouvre immédiatement. Le message est affiché aux clients.
 */
export async function pauseOrdersAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId") ?? "");
  const staff = await authorize("orders.update", restaurantId);
  const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  if (!restaurant) return;
  const tz = restaurant.timezone;
  const duree = String(form.get("duree") ?? form.get("minutes") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  const today = localDate(new Date(), tz);
  let until: Date | null = null;
  if (/^\d+$/.test(duree) && Number(duree) > 0) until = new Date(Date.now() + Math.min(Number(duree), 24 * 60) * 60_000);
  else if (duree === "today") until = zonedTime(addDays(today, 1), "00:00", tz);
  else if (duree === "date") {
    const date = String(form.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, 366)) return;
    until = zonedTime(addDays(date, 1), "00:00", tz); // date incluse
  } else if (duree === "indefinite") until = INDEFINITE;
  await db.restaurant.update({ where: { id: restaurantId }, data: { ordersPausedUntil: until, ordersPausedReason: until ? reason : "" } });
  await logAction(staff, until ? "restaurant.pause" : "restaurant.resume", "Restaurant", restaurantId, restaurantId, { until, reason });
  revalidatePath("/", "layout");
}

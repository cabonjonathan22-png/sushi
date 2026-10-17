"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_RESTAURANT_COOKIE, authorize, logAction } from "@/lib/admin";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canAccessRestaurant } from "@/lib/permissions";
import { addDays, localDate, zonedTime } from "@/lib/time";

export async function switchRestaurantAction(form: FormData) {
  const staff = await requireStaff();
  const id = String(form.get("restaurantId") ?? "");
  if (!canAccessRestaurant(staff.actor, id)) return;
  (await cookies()).set(ADMIN_RESTAURANT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.NODE_ENV === "production", maxAge: 31536000 });
  revalidatePath("/admin", "layout");
}

/** « Fermer les commandes maintenant » (jusqu'à une heure donnée ou la fin de journée) / réouvrir. */
export async function pauseOrdersAction(form: FormData) {
  const restaurantId = String(form.get("restaurantId") ?? "");
  const staff = await authorize("orders.update", restaurantId);
  const minutes = Number(form.get("minutes") ?? 0);
  const reason = String(form.get("reason") ?? "").slice(0, 200);
  let until: Date | null = null;
  if (minutes > 0) until = new Date(Date.now() + Math.min(minutes, 60 * 24 * 7) * 60_000);
  else if (minutes === -1) until = zonedTime(addDays(localDate(new Date()), 1), "06:00"); // jusqu'à demain 6h
  await db.restaurant.update({ where: { id: restaurantId }, data: { ordersPausedUntil: until, ordersPausedReason: until ? reason : "" } });
  await logAction(staff, until ? "restaurant.pause" : "restaurant.resume", "Restaurant", restaurantId, restaurantId, { until, reason });
  revalidatePath("/admin", "layout");
}

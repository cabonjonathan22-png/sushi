import { cookies } from "next/headers";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { clientIpFrom, json, readJson, sameOrigin } from "@/lib/http";
import { getLocale } from "@/i18n/server";
import { placeOrder } from "@/lib/orders/place";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** Validation de commande. Le prix est entièrement recalculé côté serveur. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, errors: [{ code: "CSRF", message: "Origine refusée." }] }, 403);
  const ip = clientIpFrom(req);
  if (!(await rateLimit(`checkout:${ip}`, LIMITS.checkout.limit, LIMITS.checkout.window))) {
    return json({ ok: false, errors: [{ code: "RATE", message: "Trop de tentatives, réessayez dans quelques minutes." }] }, 429);
  }
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return json({ ok: false, errors: [{ code: "INVALID", message: "Requête invalide." }] }, 400);
  }

  // Client connecté (facultatif) : la commande est rattachée à son compte.
  const token = (await cookies()).get("ys_client")?.value;
  const session = token ? await db.session.findUnique({ where: { id: sha256(token) } }) : null;
  const customerId = session && session.expiresAt > new Date() ? session.customerId : null;

  // Langue du client : e-mails et page de suivi dans sa langue.
  const result = await placeOrder(body, { ip, customerId, locale: await getLocale() });

  // Adresse mémorisée sur le compte si demandé.
  const b = body as { saveAddress?: boolean; address?: { street: string; extra?: string; postalCode: string; city: string; notes?: string } };
  if (result.ok && customerId && b.saveAddress && b.address) {
    const exists = await db.customerAddress.findFirst({ where: { customerId, street: b.address.street, postalCode: b.address.postalCode } });
    if (!exists) {
      await db.customerAddress.create({
        data: { customerId, street: b.address.street.slice(0, 160), extra: (b.address.extra ?? "").slice(0, 160), postalCode: b.address.postalCode.slice(0, 10), city: b.address.city.slice(0, 80), notes: (b.address.notes ?? "").slice(0, 300) },
      });
    }
  }
  return json(result, result.ok ? 200 : 422);
}

import { getStaff } from "@/lib/auth/session";

/**
 * Adresse contenue dans le QR code de la carte de fidélité.
 * Scanné par la tablette du restaurant (connectée) : fiche fidélité du client.
 * Scanné par quelqu'un d'autre : page « Mon compte » (rien n'est révélé).
 */
export async function GET(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const number = (await params).number.replace(/\D/g, "").slice(0, 12);
  const staff = await getStaff();
  const target = staff && !staff.sessionPending2fa ? `/admin/fidelite/carte/${number}` : "/compte#fidelite";
  return Response.redirect(new URL(target, req.url), 303);
}

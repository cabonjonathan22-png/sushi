import { toCsv } from "@/lib/accounting";
import { logAction } from "@/lib/admin";
import { getStaff } from "@/lib/auth/session";
import { listClients, SORTS, type SortKey } from "@/lib/customers-admin";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";

const TYPE = { ACCOUNT: "Compte client", TO_ACTIVATE: "Compte à activer", GUEST: "Sans compte" };

/**
 * Export CSV de la liste des clients (filtres de la page). Données personnelles : accès limité,
 * export tracé au journal. Ne pas utiliser pour de la prospection sans consentement (RGPD).
 */
export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff || staff.sessionPending2fa) return new Response("Non autorisé", { status: 401 });
  if (!can(staff.actor, "customers.view")) return new Response("Accès refusé", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const sort = (sp.get("tri") && sp.get("tri")! in SORTS ? sp.get("tri") : "recent") as SortKey;
  const { rows } = await listClients({ q: sp.get("q") ?? "", kind: sp.get("type") ?? "", sort, pageSize: 100_000 });
  await logAction(staff, "customers.export", "Customer", "", null, { count: rows.length, q: sp.get("q"), type: sp.get("type") });
  const csv = toCsv([
    ["Nom", "E-mail", "Téléphone", "Type", "Commandes", "Total dépensé (€)", "Dernière commande", "Points fidélité", "Client depuis"],
    ...rows.map((c) => [
      c.name, c.email, c.phone, TYPE[c.kind], c.orders, (c.spentCents / 100).toFixed(2).replace(".", ","),
      c.lastOrderAt ? formatDateTime(c.lastOrderAt) : "", c.kind === "GUEST" ? "" : c.points, c.since ? formatDateTime(c.since).slice(0, 10) : "",
    ]),
  ]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}

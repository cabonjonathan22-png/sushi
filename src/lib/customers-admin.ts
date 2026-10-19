import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

/**
 * Fichier clients du back-office : réunit
 *  - les comptes clients (actifs, ou importés de l'ancien site et pas encore activés) ;
 *  - les clients ayant commandé sans compte, regroupés par e-mail (à défaut, par téléphone).
 * Une commande passée sans compte avec l'e-mail d'un compte est rattachée à ce compte.
 */

export type ClientKind = "ACCOUNT" | "TO_ACTIVATE" | "GUEST";

export interface ClientRow {
  key: string;
  kind: ClientKind;
  name: string;
  email: string;
  phone: string;
  since: Date | null;
  orders: number;
  spentCents: number;
  lastOrderAt: Date | null;
  points: number;
}

export const SORTS = {
  recent: Prisma.sql`last DESC NULLS LAST`,
  spent: Prisma.sql`spent DESC, last DESC NULLS LAST`,
  orders: Prisma.sql`orders DESC, last DESC NULLS LAST`,
  points: Prisma.sql`points DESC, last DESC NULLS LAST`,
  name: Prisma.sql`lower(name) ASC`,
  since: Prisma.sql`since DESC NULLS LAST`,
} as const;
export type SortKey = keyof typeof SORTS;

/** Commandes comptées (ni annulées, ni en attente de paiement). */
const COUNTED = Prisma.sql`status NOT IN ('CANCELLED', 'PENDING_PAYMENT')`;

const base = Prisma.sql`
  WITH acc AS (
    SELECT c.id AS key,
           CASE WHEN c."passwordHash" <> '' THEN 'ACCOUNT' ELSE 'TO_ACTIVATE' END AS kind,
           trim(c."firstName" || ' ' || c."lastName") AS name, c.email, c.phone, c."createdAt" AS since, lower(c.email) AS em
    FROM "Customer" c WHERE c."anonymizedAt" IS NULL
  ),
  ord AS (
    SELECT CASE WHEN o."customerId" IS NOT NULL THEN o."customerId"
                WHEN a.key IS NOT NULL THEN a.key
                WHEN o."customerEmail" <> '' THEN 'e:' || lower(o."customerEmail")
                ELSE 'p:' || regexp_replace(o."customerPhone", '[^0-9+]', '', 'g') END AS key,
           o.status, o."totalCents", o."placedAt", o."customerName", o."customerEmail", o."customerPhone"
    FROM "Order" o
    LEFT JOIN acc a ON o."customerId" IS NULL AND o."customerEmail" <> '' AND a.em = lower(o."customerEmail")
  ),
  agg AS (
    SELECT key,
           count(*) FILTER (WHERE ${COUNTED})::int AS orders,
           COALESCE(sum("totalCents") FILTER (WHERE ${COUNTED}), 0)::int AS spent,
           max("placedAt") AS last, min("placedAt") AS first,
           (array_agg("customerName" ORDER BY "placedAt" DESC))[1] AS lname,
           (array_agg("customerEmail" ORDER BY "placedAt" DESC))[1] AS lemail,
           (array_agg("customerPhone" ORDER BY "placedAt" DESC))[1] AS lphone
    FROM ord GROUP BY key
  ),
  pts AS (SELECT "customerId" AS key, sum(points)::int AS points FROM "LoyaltyTransaction" GROUP BY 1),
  alls AS (
    SELECT a.key, a.kind, COALESCE(NULLIF(a.name, ''), g.lname, '') AS name, a.email, COALESCE(NULLIF(a.phone, ''), g.lphone, '') AS phone,
           LEAST(a.since, g.first) AS since, COALESCE(g.orders, 0) AS orders, COALESCE(g.spent, 0) AS spent, g.last, COALESCE(p.points, 0) AS points
    FROM acc a LEFT JOIN agg g ON g.key = a.key LEFT JOIN pts p ON p.key = a.key
    UNION ALL
    SELECT g.key, 'GUEST', g.lname, g.lemail, g.lphone, g.first, g.orders, g.spent, g.last, 0
    FROM agg g WHERE (g.key LIKE 'e:%' OR g.key LIKE 'p:%') AND g.key <> 'p:'
  )`;

function where(q: string, kind: string) {
  const parts: Prisma.Sql[] = [];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    const digits = q.replace(/[^0-9]/g, "");
    parts.push(Prisma.sql`(lower(name) LIKE ${like} OR lower(email) LIKE ${like}${digits.length >= 4 ? Prisma.sql` OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${`%${digits}%`}` : Prisma.empty})`);
  }
  if (kind === "ACCOUNT" || kind === "TO_ACTIVATE" || kind === "GUEST") parts.push(Prisma.sql`kind = ${kind}`);
  if (kind === "LOYAL") parts.push(Prisma.sql`points > 0`);
  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

export async function listClients(opts: { q?: string; kind?: string; sort?: SortKey; page?: number; pageSize?: number }) {
  const size = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.$queryRaw<(Omit<ClientRow, "spentCents" | "lastOrderAt"> & { spent: number; last: Date | null; total: bigint })[]>`
    ${base}
    SELECT *, count(*) OVER () AS total FROM alls ${where(opts.q?.trim() ?? "", opts.kind ?? "")}
    ORDER BY ${SORTS[opts.sort ?? "recent"] ?? SORTS.recent}
    LIMIT ${size} OFFSET ${(page - 1) * size}`;
  return {
    total: Number(rows[0]?.total ?? 0),
    rows: rows.map((r): ClientRow => ({ key: r.key, kind: r.kind, name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? "", since: r.since, orders: r.orders, spentCents: r.spent, lastOrderAt: r.last, points: r.points })),
  };
}

/** Chiffres de l'en-tête : nombre de clients par type, nouveaux clients du mois. */
export async function clientStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [r] = await db.$queryRaw<{ total: bigint; accounts: bigint; toActivate: bigint; guests: bigint; newThisMonth: bigint; loyal: bigint }[]>`
    ${base}
    SELECT count(*) AS total,
           count(*) FILTER (WHERE kind = 'ACCOUNT') AS "accounts",
           count(*) FILTER (WHERE kind = 'TO_ACTIVATE') AS "toActivate",
           count(*) FILTER (WHERE kind = 'GUEST') AS "guests",
           count(*) FILTER (WHERE since >= ${monthStart}) AS "newThisMonth",
           count(*) FILTER (WHERE points > 0) AS "loyal"
    FROM alls`;
  return Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, Number(v)])) as Record<"total" | "accounts" | "toActivate" | "guests" | "newThisMonth" | "loyal", number>;
}

/** Clé d'un client sans compte (adresse e-mail ou téléphone), lisible dans l'URL. */
export const guestKey = (key: string) => Buffer.from(key).toString("base64url");
export const parseGuestKey = (param: string) => {
  const k = Buffer.from(param, "base64url").toString();
  return k.startsWith("e:") || k.startsWith("p:") ? k : null;
};
/** Lien vers la fiche d'un client (compte : son identifiant ; sans compte : clé encodée). */
export const clientHref = (key: string) => `/admin/clients/${key.startsWith("e:") || key.startsWith("p:") ? `g-${guestKey(key)}` : key}`;

/** Fiche client : identité, commandes, statistiques. */
export async function loadClient(param: string) {
  if (param.startsWith("g-")) {
    const key = parseGuestKey(param.slice(2));
    if (!key) return null;
    const value = key.slice(2);
    const orders = await db.order.findMany({
      where: key.startsWith("e:")
        ? { customerId: null, customerEmail: { equals: value, mode: "insensitive" } }
        : { customerId: null, customerEmail: "", customerPhone: { contains: value.slice(-9) } },
      orderBy: { placedAt: "desc" },
      include: { lines: { select: { name: true, quantity: true, categoryName: true } }, restaurant: { select: { name: true } } },
    });
    if (!orders.length) return null;
    const last = orders[0]!;
    return { kind: "GUEST" as ClientKind, customer: null, name: last.customerName, email: last.customerEmail, phone: last.customerPhone, orders };
  }
  const customer = await db.customer.findUnique({ where: { id: param }, include: { addresses: true } });
  if (!customer || customer.anonymizedAt) return null;
  const orders = await db.order.findMany({
    where: { OR: [{ customerId: customer.id }, { customerId: null, customerEmail: { equals: customer.email, mode: "insensitive" } }] },
    orderBy: { placedAt: "desc" },
    include: { lines: { select: { name: true, quantity: true, categoryName: true } }, restaurant: { select: { name: true } } },
  });
  return {
    kind: (customer.passwordHash ? "ACCOUNT" : "TO_ACTIVATE") as ClientKind,
    customer,
    name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || orders[0]?.customerName || "",
    email: customer.email,
    phone: customer.phone || orders[0]?.customerPhone || "",
    orders,
  };
}

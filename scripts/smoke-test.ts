/**
 * Test d'intégration de bout en bout contre un serveur lancé (npm run dev).
 *   npm run test:smoke            (APP_URL, DATABASE_URL, APP_ENCRYPTION_KEY dans .env)
 *
 * Vérifie : commande, impression (agent ESC/POS, Star CloudPRNT, Epson SDP), API REST,
 * webhooks signés, paiement Stripe confirmé par webhook signé, e-mails.
 * ⚠ Crée de vraies commandes de test : à lancer sur une base de développement uniquement.
 */
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import Stripe from "stripe";
import { encryptSecret, randomToken, sha256 } from "../src/lib/crypto.ts";
import { db } from "../src/lib/db.ts";
import { signPayload } from "../src/lib/webhooks.ts";

const B = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 15000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  return null;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusé : test destructif, base de développement uniquement.");
  const restaurant = await db.restaurant.findFirstOrThrow({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const saved = { pk: restaurant.stripePublishableKey, sk: restaurant.stripeSecretKeyEnc, wh: restaurant.stripeWebhookSecretEnc };

  // Récepteur de webhooks local
  const received: { event: string; signature: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ event: String(req.headers["x-yaoma-event"]), signature: String(req.headers["x-yaoma-signature"]), body });
      res.end("ok");
    });
  }).listen(4555);

  const tokens = { agent: randomToken(24), star: randomToken(24), epson: randomToken(24) };
  const printers: { id: string }[] = await Promise.all([
    db.printer.create({ data: { restaurantId: restaurant.id, name: "TEST agent", method: "LOCAL_AGENT", deviceToken: tokens.agent } }),
    db.printer.create({ data: { restaurantId: restaurant.id, name: "TEST Star", method: "STAR_CLOUDPRNT", deviceToken: tokens.star } }),
    db.printer.create({ data: { restaurantId: restaurant.id, name: "TEST Epson", method: "EPSON_SDP", deviceToken: tokens.epson, copies: 2 } }),
  ]);
  const apiKey = `ysk_${randomToken(24)}`;
  const key = await db.apiKey.create({ data: { restaurantId: restaurant.id, name: "TEST", prefix: apiKey.slice(0, 12), hash: sha256(apiKey) } });
  const hookSecret = `whsec_${randomToken(16)}`;
  const hook = await db.webhookEndpoint.create({ data: { restaurantId: restaurant.id, url: "http://localhost:4555/hook", secret: hookSecret, events: ["order.created", "order.status_changed"] } });
  const whsec = "whsec_smoketest";
  await db.restaurant.update({ where: { id: restaurant.id }, data: { stripePublishableKey: "pk_test_smoke", stripeSecretKeyEnc: encryptSecret("sk_test_smoke"), stripeWebhookSecretEnc: encryptSecret(whsec) } });

  try {
    // 1. Commande (retrait, espèces)
    const product = await db.product.findFirstOrThrow({ where: { active: true, archived: false, variants: { none: {} }, optionGroups: { none: {} }, isAlcohol: false, priceCents: { gt: 1000 } } });
    const slots = (await (await fetch(`${B}/api/restaurants/${restaurant.slug}/slots?mode=PICKUP`)).json()) as { days: { slots: { start: string; full: boolean }[] }[] };
    const slot = slots.days.flatMap((d) => d.slots).find((s) => !s.full);
    check(!!slot, "créneaux disponibles");
    const place = async () => {
      const r = await fetch(`${B}/api/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: B },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug, mode: "PICKUP", slotStart: slot!.start, lines: [{ productId: product.id, quantity: 3 }],
          customer: { firstName: "Test", lastName: "Smoke", phone: "0600000000", email: "smoke@example.com" }, paymentMethod: "CASH", acceptTerms: true,
        }),
      });
      return (await r.json()) as { ok: boolean; orderId: string; errors?: { message: string }[] };
    };
    const placed = await place();
    check(placed.ok, "commande passée", placed.errors?.[0]?.message ?? "");
    const orderId = placed.orderId;

    // 2. Impression
    check((await db.printJob.count({ where: { orderId, printerId: { in: printers.map((p) => p.id) } } })) === 3, "3 tickets en file (agent, Star, Epson)");

    const agent = (await (await fetch(`${B}/api/print/agent/${tokens.agent}`)).json()) as { job: { id: string; data: string } | null };
    const bytes = agent.job ? Buffer.from(agent.job.data, "base64") : Buffer.alloc(0);
    check(bytes[0] === 0x1b && bytes[1] === 0x40 && bytes.includes(0x56), "agent : ticket ESC/POS (init + coupe)");
    await fetch(`${B}/api/print/agent/${tokens.agent}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: agent.job?.id, ok: true }) });

    const poll = (await (await fetch(`${B}/api/print/cloudprnt/${tokens.star}`, { method: "POST", body: "{}" })).json()) as { jobReady: boolean; jobToken: string };
    check(poll.jobReady, "Star CloudPRNT : ticket annoncé");
    const markup = await (await fetch(`${B}/api/print/cloudprnt/${tokens.star}?type=text/vnd.star.markup&token=${poll.jobToken}`)).text();
    check(markup.includes("[cut") && markup.includes("RETRAIT"), "Star CloudPRNT : Star Markup");
    await fetch(`${B}/api/print/cloudprnt/${tokens.star}?token=${poll.jobToken}&code=200%20OK`, { method: "DELETE" });

    const ep = await (await fetch(`${B}/api/print/epson/${tokens.epson}`, { method: "POST", body: "ConnectionType=GetRequest&ID=x" })).text();
    const epJob = ep.match(/<printjobid>([^<]+)</)?.[1];
    check(!!epJob && (ep.match(/<ePOSPrint>/g) ?? []).length === 2, "Epson SDP : XML ePOS, 2 exemplaires");
    await fetch(`${B}/api/print/epson/${tokens.epson}`, { method: "POST", body: new URLSearchParams({ ConnectionType: "SetResponse", ResponseFile: `<PrintResponseInfo><ePOSPrint><Parameter><printjobid>${epJob}</printjobid></Parameter><PrintResponse><response success="true" code=""/></PrintResponse></ePOSPrint></PrintResponseInfo>` }).toString() });
    check((await db.printJob.count({ where: { orderId, status: "DONE", printerId: { in: printers.map((p) => p.id) } } })) === 3, "3 tickets confirmés imprimés");

    // 3. API REST
    const H = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    check((await fetch(`${B}/api/v1/orders`)).status === 401, "API : refus sans clé");
    const list = (await (await fetch(`${B}/api/v1/orders?status=NEW&limit=100`, { headers: H })).json()) as { data: { id: string; items: unknown[] }[] };
    check(list.data.some((o) => o.id === orderId && o.items.length === 1), "API : liste des commandes (contenu complet)");
    const accept = await fetch(`${B}/api/v1/orders/${orderId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "ACCEPTED" }) });
    check(accept.status === 200, "API : statut Nouvelle → Acceptée");
    const bad = await fetch(`${B}/api/v1/orders/${orderId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "OUT_FOR_DELIVERY" }) });
    check(bad.status === 409, "API : transition impossible refusée (409)");
    const menu = (await (await fetch(`${B}/api/v1/menu`, { headers: H })).json()) as { data: { products: unknown[] } };
    check(menu.data.products.length > 50, "API : menu", `${menu.data.products.length} produits`);

    // 4. Webhooks signés
    const created = await waitFor(async () => received.find((r) => r.event === "order.created" && r.body.includes(orderId)));
    const sigOk = !!created && (() => {
      const t = Number(created.signature.match(/t=(\d+)/)?.[1]);
      return signPayload(hookSecret, created.body, t) === created.signature;
    })();
    check(sigOk, "webhook order.created reçu, signature valide");
    check(!!(await waitFor(async () => received.find((r) => r.event === "order.status_changed" && r.body.includes(orderId)))), "webhook order.status_changed reçu");

    // 5. Paiement Stripe confirmé par webhook signé
    const second = await place();
    const o2 = await db.order.findUniqueOrThrow({ where: { id: second.orderId } });
    await db.order.update({ where: { id: o2.id }, data: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" } });
    const intentId = `pi_smoke_${randomToken(8)}`;
    await db.payment.create({ data: { orderId: o2.id, method: "ONLINE_CARD", amountCents: o2.totalCents, status: "PENDING", stripePaymentIntentId: intentId } });
    const event = JSON.stringify({ id: "evt_smoke", object: "event", type: "payment_intent.succeeded", data: { object: { id: intentId, object: "payment_intent", amount_received: o2.totalCents, metadata: { orderId: o2.id, restaurantId: restaurant.id } } } });
    const header = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: event, secret: whsec });
    check((await fetch(`${B}/api/stripe/webhook/${restaurant.id}`, { method: "POST", headers: { "stripe-signature": "t=1,v1=faux" }, body: event })).status === 400, "Stripe : signature invalide refusée");
    check((await fetch(`${B}/api/stripe/webhook/${restaurant.id}`, { method: "POST", headers: { "stripe-signature": header }, body: event })).status === 200, "Stripe : webhook signé accepté");
    const after = await db.order.findUniqueOrThrow({ where: { id: o2.id } });
    check(after.status === "NEW" && after.paymentStatus === "PAID", "Stripe : commande confirmée et payée");

    // 6. BizPrint (BizSwoop) avec un faux serveur BizPrint local
    const bizKeys = { publicKey: "pk_smoke_bizprint", secretKey: "sk_smoke_bizprint" };
    const bizCalls: { method: string; body: Record<string, unknown> | null; pdf?: string }[] = [];
    const bizServer = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        if (req.method === "POST" && req.url?.endsWith("/jobs")) {
          const body = JSON.parse(raw) as Record<string, unknown>;
          const { hash, ...signed } = body;
          const { createHash } = await import("node:crypto");
          const valid = hash === createHash("sha256").update(`${JSON.stringify(signed)}:${bizKeys.secretKey}`).digest("hex");
          const pdf = await fetch(String(body.url)).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b).subarray(0, 4).toString()).catch(() => "");
          bizCalls.push({ method: valid ? "POST-signé" : "POST-invalide", body, pdf });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ job: { id: 4242, status: "pending" } }));
        } else {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ id: 4242, status: "COMPLETED" }));
        }
      });
    }).listen(4556);
    process.env.BIZPRINT_API_URL = "http://localhost:4556/api/connect-application/v1";
    const { submitBizPrint, refreshBizPrintJobs } = await import("../src/lib/print/bizprint.ts");
    await db.restaurant.update({ where: { id: restaurant.id }, data: { bizprintPublicKey: bizKeys.publicKey, bizprintSecretEnc: encryptSecret(bizKeys.secretKey) } });
    const bizPrinter = await db.printer.create({ data: { restaurantId: restaurant.id, name: "TEST BizPrint", method: "BIZPRINT", remotePrinterId: "77", deviceToken: randomToken(24), autoPrint: false } });
    printers.push(bizPrinter);
    const bizJob = await db.printJob.create({ data: { orderId, printerId: bizPrinter.id, copies: 2 } });
    await submitBizPrint({ printJobId: bizJob.id });
    check(bizCalls[0]?.method === "POST-signé" && bizCalls[0].body?.printerId === 77, "BizPrint : travail envoyé, signature valide");
    check(bizCalls[0]?.pdf === "%PDF", "BizPrint : la station peut télécharger le ticket PDF (lien signé)");
    check((await fetch(String(bizCalls[0]?.body?.url).replace(/sig=[a-f0-9]+/, "sig=" + "0".repeat(64)))).status === 403, "BizPrint : lien falsifié refusé");
    await refreshBizPrintJobs();
    check((await db.printJob.findUniqueOrThrow({ where: { id: bizJob.id } })).status === "DONE", "BizPrint : statut « imprimé » remonté");
    bizServer.close();
    await db.restaurant.update({ where: { id: restaurant.id }, data: { bizprintPublicKey: "", bizprintSecretEnc: "" } });

    // 7. E-mails (mode développement : fichiers dans storage/mails)
    const mails = await waitFor(async () => (await readdir("storage/mails").catch(() => [] as string[])).length > 0);
    check(!!mails, "e-mails générés");
  } finally {
    await db.restaurant.update({ where: { id: restaurant.id }, data: { stripePublishableKey: saved.pk, stripeSecretKeyEnc: saved.sk, stripeWebhookSecretEnc: saved.wh } });
    await db.printer.updateMany({ where: { id: { in: printers.map((p) => p.id) } }, data: { active: false } });
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await db.webhookEndpoint.delete({ where: { id: hook.id } });
    server.close();
    await db.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : "\nTout est OK.");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

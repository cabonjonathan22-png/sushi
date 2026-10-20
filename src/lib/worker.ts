import { getT } from "@/i18n/server";
import { purgeSessions } from "./auth/session-purge";
import { readConfig } from "./config";
import { db } from "./db";
import { customerConfirmation, customerStatusChange, restaurantNewOrder } from "./emails";
import { runJobs, type JobHandler, type JobType } from "./jobs";
import { sendMail } from "./mail";
import { expireInactivePoints } from "./loyalty";
import { loadOrder } from "./orders/load";
import { cancelAbandonedPayments } from "./orders/manage";
import { refreshBizPrintJobs, submitBizPrint } from "./print/bizprint";
import { submitDirect } from "./print/direct";
import { submitPrintNode } from "./print/printnode";
import { purgeRateLimits } from "./rate-limit";
import { anonymizeInactiveCustomers } from "./retention";
import { deliverWebhook } from "./webhooks";

/**
 * Worker en tâche de fond, lancé une seule fois au démarrage du serveur Node
 * (src/instrumentation.ts). Traite la file (e-mails, webhooks, PrintNode) toutes
 * les 3 secondes et fait le ménage périodique.
 */

type EmailPayload = { kind: "customerConfirmation" | "restaurantNewOrder" | "customerStatus"; orderId: string; to?: string[] };

const handlers: Record<JobType, JobHandler> = {
  async email(p) {
    const { kind, orderId, to } = p as EmailPayload;
    const order = await loadOrder(orderId);
    if (!order) return;
    // Client : langue de sa commande. Restaurant : langue par défaut du site.
    const [settings, config] = await Promise.all([db.siteSettings.findUnique({ where: { id: 1 }, select: { brandName: true } }), readConfig()]);
    const locale = kind === "restaurantNewOrder" ? config.region.defaultLocale : order.locale || config.region.defaultLocale;
    const ctx = { t: await getT(locale), locale, brand: settings?.brandName ?? "" };
    const mail = kind === "customerConfirmation" ? customerConfirmation(order, ctx)
      : kind === "restaurantNewOrder" ? restaurantNewOrder(order, ctx)
      : customerStatusChange(order, ctx);
    const replyTo = kind === "restaurantNewOrder" ? order.customerEmail : order.restaurant.email || undefined;
    await sendMail({ ...mail, to: kind === "restaurantNewOrder" ? (to ?? []) : order.customerEmail, replyTo });
  },
  webhook: (p) => deliverWebhook(p as Parameters<typeof deliverWebhook>[0]),
  printnode: (p) => submitPrintNode(p as { printJobId: string }),
  bizprint: (p) => submitBizPrint(p as { printJobId: string }),
  printdirect: (p) => submitDirect(p as { printJobId: string }),
};

const g = globalThis as unknown as { __ysWorker?: boolean };

/** Vide la file de tâches (e-mails, webhooks, impressions distantes). */
export async function drainJobs(): Promise<number> {
  let total = 0;
  for (let n = await runJobs(handlers); n > 0; n = await runJobs(handlers)) total += n;
  return total;
}

/**
 * Hébergement « serverless » (Vercel) : pas de processus permanent. La file est vidée
 * juste après chaque requête qui ajoute une tâche (voir enqueue) et le ménage
 * périodique passe par une tâche planifiée (/api/cron).
 */
export async function maintenance(): Promise<void> {
  await Promise.allSettled([refreshBizPrintJobs(), cancelAbandonedPayments(), purgeSessions(), purgeRateLimits(), anonymizeInactiveCustomers(), expireInactivePoints()]);
  await drainJobs();
  // Traduction d'avance de la carte dans les langues proposées (dans la limite du quota du jour).
  await import("./translation-sources").then((m) => m.pretranslateAll()).catch((e) => console.error("[maintenance] traduction", e));
}

export const serverless = () => !!process.env.VERCEL || process.env.SERVERLESS === "1";

export function startWorker() {
  if (g.__ysWorker || process.env.DISABLE_WORKER === "1" || serverless()) return;
  g.__ysWorker = true;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await drainJobs();
    } catch (e) {
      console.error("[worker] file de tâches", e);
    } finally {
      busy = false;
    }
  }, 3000).unref();

  // Statut des tickets envoyés à BizPrint (imprimé / échec).
  setInterval(() => {
    refreshBizPrintJobs().catch((e) => console.error("[worker] bizprint", e));
  }, 60_000).unref();

  setInterval(() => {
    cancelAbandonedPayments().catch((e) => console.error("[worker] paiements abandonnés", e));
  }, 5 * 60_000).unref();

  setInterval(() => {
    Promise.all([purgeSessions(), purgeRateLimits(), anonymizeInactiveCustomers(), expireInactivePoints()]).catch((e) => console.error("[worker] purge", e));
  }, 60 * 60_000).unref();

  // Traduction d'avance de la carte (quota gratuit du jour), au démarrage puis toutes les 6 h.
  const pretranslate = () => import("./translation-sources").then((m) => m.pretranslateAll()).catch((e) => console.error("[worker] traduction", e));
  setTimeout(pretranslate, 60_000).unref();
  setInterval(pretranslate, 6 * 3600_000).unref();

  console.log("[worker] démarré");
}

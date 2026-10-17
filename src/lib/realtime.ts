import { EventEmitter } from "node:events";
import pg from "pg";

/**
 * Temps réel : un trigger PostgreSQL publie chaque création / modification de commande
 * (canal « orders »). Une seule connexion LISTEN par processus relaie vers les clients
 * SSE abonnés (écran commandes, écran cuisine). Fonctionne aussi avec plusieurs
 * instances du serveur, puisque la notification vient de la base.
 */

export interface OrderEvent {
  restaurantId: string;
  orderId: string;
  status: string;
  op: "INSERT" | "UPDATE";
}

const g = globalThis as unknown as { __ysRealtime?: { bus: EventEmitter; started: boolean } };
const state = (g.__ysRealtime ??= { bus: new EventEmitter().setMaxListeners(500), started: false });

async function connect(): Promise<void> {
  // LISTEN exige une connexion directe (pas un pooler type PgBouncer / Neon « -pooler »).
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL });
  client.on("notification", (msg) => {
    if (msg.channel !== "orders" || !msg.payload) return;
    try {
      state.bus.emit("order", JSON.parse(msg.payload) as OrderEvent);
    } catch {
      /* notification illisible : ignorée */
    }
  });
  const retry = () => {
    client.removeAllListeners();
    client.end().catch(() => {});
    setTimeout(() => connect().catch(retry), 3000);
  };
  client.on("error", retry);
  client.on("end", retry);
  await client.connect();
  await client.query("LISTEN orders");
}

function ensureStarted() {
  if (state.started) return;
  state.started = true;
  connect().catch((e) => {
    console.error("[realtime] connexion LISTEN impossible", e);
    state.started = false;
  });
}

/** S'abonne aux événements des restaurants donnés. Renvoie la fonction de désabonnement. */
export function subscribeOrders(restaurantIds: string[] | "all", listener: (e: OrderEvent) => void): () => void {
  ensureStarted();
  const wrapped = (e: OrderEvent) => {
    if (restaurantIds === "all" || restaurantIds.includes(e.restaurantId)) listener(e);
  };
  state.bus.on("order", wrapped);
  return () => state.bus.off("order", wrapped);
}

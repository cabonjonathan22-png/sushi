#!/usr/bin/env node
/**
 * Agent d'impression Yaoma — à lancer sur un PC (ou Raspberry Pi) du restaurant.
 * Interroge le site toutes les 3 secondes et envoie les tickets en ESC/POS
 * à une imprimante thermique réseau (Epson, Star, Xprinter… port 9100).
 *
 *   node print-agent.mjs <URL de l'agent> <IP de l'imprimante> [port]
 *   ex. node print-agent.mjs https://yaoma-sushi.com/api/print/agent/AbC123… 192.168.1.50
 *
 * Aucune dépendance : Node.js 18+ suffit. Pour un démarrage automatique sous Windows,
 * voir docs/impression.md (Planificateur de tâches).
 */
import net from "node:net";

const [url, host, port = "9100"] = process.argv.slice(2);
if (!url || !host) {
  console.error("Usage : node print-agent.mjs <URL agent> <IP imprimante> [port]");
  process.exit(1);
}

function send(data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port), timeout: 10000 }, () => {
      socket.end(data, resolve);
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Imprimante injoignable (délai dépassé)"));
    });
    socket.on("error", reject);
  });
}

async function tick() {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Serveur : HTTP ${res.status}`);
  const { job } = await res.json();
  if (!job) return;
  try {
    await send(Buffer.from(job.data, "base64"));
    console.log(new Date().toLocaleTimeString("fr-FR"), "imprimé", job.reference);
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, ok: true }) });
  } catch (e) {
    console.error(new Date().toLocaleTimeString("fr-FR"), "échec", job.reference, e.message);
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, ok: false, error: e.message }) });
  }
}

console.log(`Agent Yaoma démarré → imprimante ${host}:${port}`);
for (;;) {
  await tick().catch((e) => console.error(new Date().toLocaleTimeString("fr-FR"), e.message));
  await new Promise((r) => setTimeout(r, 3000));
}

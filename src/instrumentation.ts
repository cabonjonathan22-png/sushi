/** Démarrage du serveur Node : worker (file de tâches, ménage) — jamais dans le runtime Edge. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("./lib/worker");
    startWorker();
  }
}

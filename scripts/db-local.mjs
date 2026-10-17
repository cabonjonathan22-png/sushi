// Base PostgreSQL de développement, propre au projet (port 5433).
// Les données sont HORS du dossier du projet (sinon chaque écriture de la base relance
// la compilation de Next.js) : %LOCALAPPDATA%\yaoma\pgdata, ou ~/.yaoma/pgdata, ou PGDATA_DIR.
// Utilise les binaires PostgreSQL du PATH (ou PG_BIN). Usage : node scripts/db-local.mjs [start|stop|status]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = process.env.PGDATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".yaoma"), process.env.LOCALAPPDATA ? "yaoma" : "", "pgdata");
const port = process.env.PG_PORT ?? "5433";
const bin = (n) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, n) : n);
const run = (cmd, args, opts = {}) => execFileSync(bin(cmd), args, { stdio: "inherit", ...opts });
const action = process.argv[2] ?? "start";

if (action === "stop") run("pg_ctl", ["-D", dir, "stop", "-m", "fast"]);
else if (action === "status") run("pg_ctl", ["-D", dir, "status"]);
else {
  if (!existsSync(path.join(dir, "PG_VERSION"))) {
    run("initdb", ["-D", dir, "-U", "yaoma", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  }
  try {
    execFileSync(bin("pg_ctl"), ["-D", dir, "status"], { stdio: "ignore" });
    console.log("PostgreSQL déjà démarré.");
  } catch {
    // stdio ignoré : sous Windows, le serveur hériterait de la sortie et bloquerait le script.
    run("pg_ctl", ["-D", dir, "-o", `-p ${port}`, "-l", path.join(dir, "server.log"), "-w", "start"], { stdio: "ignore" });
    console.log(`PostgreSQL démarré sur le port ${port}.`);
  }
  try {
    execFileSync(bin("createdb"), ["-h", "localhost", "-p", port, "-U", "yaoma", "yaoma"], { stdio: "ignore" });
    console.log("Base « yaoma » créée.");
  } catch { /* existe déjà */ }
  console.log(`DATABASE_URL=postgresql://yaoma@localhost:${port}/yaoma`);
}

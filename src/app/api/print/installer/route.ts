import { db } from "@/lib/db";
import { clientIpFrom } from "@/lib/http";
import { findPairingCode } from "@/lib/pairing";
import { buildInstaller } from "@/lib/print/installer";
import { rateLimit } from "@/lib/rate-limit";

/** Installateur Windows du poste d'impression, contre un code d'installation valable. */
export async function GET(req: Request) {
  if (!(await rateLimit(`installer:${clientIpFrom(req)}`, 20, 600))) return new Response("Trop d'essais", { status: 429 });
  const p = await findPairingCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!p || p.purpose !== "PRINTER" || !p.printerId) return new Response("Code inconnu ou expiré", { status: 404 });
  const printer = await db.printer.findUnique({ where: { id: p.printerId } });
  if (!printer) return new Response("Imprimante supprimée", { status: 404 });
  const info = (printer.agentInfo ?? {}) as Record<string, unknown>;
  await db.printer.update({ where: { id: printer.id }, data: { agentInfo: { ...info, downloadedAt: new Date().toISOString() } } });
  return new Response(buildInstaller(`${new URL(req.url).origin}/api/print/agent/${printer.deviceToken}`), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Installer-impression-Yaoma.cmd"',
      "Cache-Control": "no-store",
    },
  });
}

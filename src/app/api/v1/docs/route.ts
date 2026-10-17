import { openApiSpec } from "@/lib/openapi";
import { appUrl } from "@/lib/seo";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Documentation lisible de l'API (générée depuis la spécification OpenAPI, sans script externe). */
export function GET() {
  const base = appUrl();
  const spec = openApiSpec(base);
  const ops = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, { summary: string; description?: string; parameters?: { name: string; in: string; description?: string }[] }>).map(([m, op]) => ({ path, m, op })),
  );
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API Yaoma Sushi</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px;line-height:1.5;color:#111}code,pre{background:#f4f4f4;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow:auto}
.op{border:1px solid #ddd;border-radius:12px;padding:16px;margin:16px 0}.m{font-weight:700;color:#fff;border-radius:6px;padding:2px 8px;margin-right:8px}.get{background:#0a7}.post{background:#d9441b}</style></head><body>
<h1>${esc(spec.info.title)} <small>v${spec.info.version}</small></h1>
<p>${esc(spec.info.description).replace(/`([^`]+)`/g, "<code>$1</code>")}</p>
<p>Base : <code>${esc(base)}/api/v1</code> · Spécification : <a href="/api/v1/openapi.json">openapi.json</a> (importable dans Postman, Insomnia…)</p>
<h2>Exemple</h2><pre>curl -H "Authorization: Bearer ysk_…" "${esc(base)}/api/v1/orders?status=NEW"</pre>
<h2>Vérifier la signature d'un webhook (Node.js)</h2><pre>const [t, v1] = header.split(",").map(p => p.split("=")[1]);
const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
const ok = expected === v1 &amp;&amp; Math.abs(Date.now()/1000 - Number(t)) &lt; 300;</pre>
<h2>Points d'accès</h2>
${ops.map(({ path, m, op }) => `<div class="op"><p><span class="m ${m}">${m.toUpperCase()}</span><code>${esc(path)}</code> — ${esc(op.summary)}</p>${op.description ? `<p>${esc(op.description)}</p>` : ""}${op.parameters?.length ? `<ul>${op.parameters.map((p) => `<li><code>${esc(p.name)}</code> (${p.in})${p.description ? ` — ${esc(p.description)}` : ""}</li>`).join("")}</ul>` : ""}</div>`).join("")}
<h2>Statuts</h2><p>NEW → ACCEPTED → PREPARING → READY / OUT_FOR_DELIVERY → COMPLETED, ou CANCELLED (motif obligatoire). Montants en centimes TTC.</p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAllPages, getJson, type FetchOptions } from "./http.ts";

/**
 * Lecture via l'API REST WooCommerce authentifiée (clé « Lecture » uniquement).
 * Sert à récupérer ce que la Store API publique n'expose pas :
 * méta-données Orderable (allergènes…), classes de TVA, vraies zones, moyens de paiement.
 */
export interface WooAuth {
  base: string;
  opts: FetchOptions;
}

type Meta = { key: string; value: unknown };
interface WcProduct { id: number; tax_class: string; tax_status: string; meta_data: Meta[] }

/** Méta-données utiles d'un produit (on ignore les clés techniques). */
const META_UTILES = /orderable|allerg|nutri|label/i;

export async function lireProduitsWoo(auth: WooAuth): Promise<Map<number, Record<string, unknown>>> {
  const produits = await getAllPages<WcProduct>(`${auth.base}/wp-json/wc/v3/products?status=publish`, auth.opts);
  const out = new Map<number, Record<string, unknown>>();
  for (const p of produits) {
    out.set(p.id, {
      tax_class: p.tax_class,
      tax_status: p.tax_status,
      meta: Object.fromEntries(p.meta_data.filter((m) => META_UTILES.test(m.key)).map((m) => [m.key, m.value])),
    });
  }
  return out;
}

export async function lireReglagesWoo(auth: WooAuth): Promise<Record<string, unknown>> {
  const zones = (await getJson<{ id: number; name: string }[]>(`${auth.base}/wp-json/wc/v3/shipping/zones`, auth.opts)).data;
  const zonesDetail = [];
  for (const z of zones) {
    const [locations, methods] = await Promise.all([
      getJson<unknown[]>(`${auth.base}/wp-json/wc/v3/shipping/zones/${z.id}/locations`, auth.opts),
      getJson<unknown[]>(`${auth.base}/wp-json/wc/v3/shipping/zones/${z.id}/methods`, auth.opts),
    ]);
    type Method = { method_id: string; title: string; enabled: boolean; settings: Record<string, { value?: unknown }> };
    zonesDetail.push({
      nom: z.name,
      emplacements: (locations.data as { code: string; type: string }[]).map((l) => `${l.type}:${l.code}`),
      methodes: (methods.data as Method[]).map((m) => ({
        // Les réglages d'abord : certains (ex. « type ») ne doivent pas écraser l'identité de la méthode.
        ...Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value])),
        type: m.method_id,
        titre: m.title,
        actif: m.enabled,
      })),
    });
  }
  type Gateway = { id: string; title: string; enabled: boolean };
  const gateways = (await getJson<Gateway[]>(`${auth.base}/wp-json/wc/v3/payment_gateways`, auth.opts)).data;
  type Tax = { class: string; rate: string; name: string; shipping: boolean };
  const taxes = (await getJson<Tax[]>(`${auth.base}/wp-json/wc/v3/taxes?per_page=100`, auth.opts)).data
    .map((t) => ({ classe: t.class, taux: Number(t.rate), nom: t.name, surLivraison: t.shipping }));
  return {
    zonesLivraison: zonesDetail,
    moyensPaiement: gateways.filter((g) => g.enabled).map((g) => ({ id: g.id, titre: g.title })),
    taux: taxes,
  };
}

/**
 * Historique des commandes et clients : écrit dans import/private/ (ignoré par git,
 * contient des données personnelles). Relançable : les fichiers sont réécrits.
 */
export async function exporterCommandes(auth: WooAuth, dossier: string): Promise<{ commandes: number; clients: number }> {
  await mkdir(dossier, { recursive: true });
  const commandes = await getAllPages<unknown>(`${auth.base}/wp-json/wc/v3/orders?orderby=date&order=asc`, auth.opts);
  await writeFile(path.join(dossier, "orders.json"), JSON.stringify(commandes, null, 1));
  const clients = await getAllPages<unknown>(`${auth.base}/wp-json/wc/v3/customers?role=all`, auth.opts);
  await writeFile(path.join(dossier, "customers.json"), JSON.stringify(clients, null, 1));
  return { commandes: commandes.length, clients: clients.length };
}

const UA = "Mozilla/5.0 (compatible; yaoma-import/1.0)";

export interface FetchOptions {
  /** Authentification Basic pour l'API REST WooCommerce (clé lecture seule). */
  auth?: { key: string; secret: string };
  retries?: number;
}

/** GET avec relances (erreurs réseau et 5xx), renvoie la réponse brute. */
export async function get(url: string, opts: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { "User-Agent": UA };
  if (opts.auth) {
    headers.Authorization =
      "Basic " + Buffer.from(`${opts.auth.key}:${opts.auth.secret}`).toString("base64");
  }
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status >= 500 && attempt < retries) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= retries) throw new Error(`Échec GET ${url} : ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

export async function getJson<T>(url: string, opts?: FetchOptions): Promise<{ data: T; headers: Headers }> {
  const res = await get(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return { data: (await res.json()) as T, headers: res.headers };
}

export async function getText(url: string): Promise<string> {
  const res = await get(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/** Récupère toutes les pages d'une collection paginée (en-tête X-WP-TotalPages). */
export async function getAllPages<T>(baseUrl: string, opts?: FetchOptions): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const { data, headers } = await getJson<T[]>(`${baseUrl}${sep}per_page=100&page=${page}`, opts);
    out.push(...data);
    const total = Number(headers.get("x-wp-totalpages") ?? "1");
    if (page >= total || data.length === 0) return out;
  }
}

/** Exécute `fn` sur chaque élément avec au plus `limit` tâches en parallèle. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Spécification OpenAPI 3.1 de l'API publique (servie sur /api/v1/openapi.json). */
export function openApiSpec(baseUrl: string) {
  const money = { type: "integer", description: "Montant en centimes d'euro TTC" };
  const error = { $ref: "#/components/schemas/Error" };
  const order = {
    type: "object",
    properties: {
      id: { type: "string" },
      reference: { type: "string", example: "YS-CUC-000123" },
      number: { type: "integer", description: "Numéro séquentiel du restaurant" },
      dailyNumber: { type: "integer", description: "Numéro court du jour (ticket)" },
      restaurant: { type: "object", properties: { id: { type: "string" }, slug: { type: "string" }, name: { type: "string" } } },
      status: { $ref: "#/components/schemas/Status" },
      mode: { type: "string", enum: ["PICKUP", "DELIVERY", "DINE_IN"] },
      period: { type: "string", enum: ["LUNCH", "DINNER"] },
      slot: { type: "object", properties: { start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" } } },
      customer: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } } },
      address: {
        type: ["object", "null"],
        properties: { street: { type: "string" }, extra: { type: "string" }, postalCode: { type: "string" }, city: { type: "string" }, notes: { type: "string" }, zone: { type: "string" } },
      },
      notes: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productId: { type: ["string", "null"] }, variantId: { type: ["string", "null"] }, name: { type: "string" }, variant: { type: ["string", "null"] },
            options: { type: "array", items: { type: "object", properties: { group: { type: "string" }, name: { type: "string" }, priceDeltaCents: money } } },
            quantity: { type: "integer" }, unitPrice: money, total: money, vatRate: { type: "number", example: 10 },
          },
        },
      },
      totals: {
        type: "object",
        properties: {
          currency: { type: "string", example: "EUR" }, subtotal: money, discount: money, deliveryFee: money, total: money,
          vat: { type: "array", items: { type: "object", properties: { rate: { type: "integer", description: "Points de base (1000 = 10 %)" }, baseCents: money, vatCents: money, totalCents: money } } },
        },
      },
      payment: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["ONLINE_CARD", "CASH", "CARD_TERMINAL", "MEAL_VOUCHER_PAPER", "MEAL_VOUCHER_CARD"] },
          status: { type: "string", enum: ["UNPAID", "PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"] },
          paid: { type: "boolean" },
        },
      },
      promoCode: { type: ["string", "null"] },
      placedAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "API Yaoma Sushi",
      version: "1.0.0",
      description:
        "API des commandes et du menu. Authentification : `Authorization: Bearer ysk_…` (clé créée dans le back-office, « API & webhooks »), limitée à un restaurant. " +
        "300 requêtes par minute. Webhooks sortants (order.created, order.status_changed) : POST JSON signé `X-Yaoma-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, \"<t>.<corps>\")>`.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
        Status: { type: "string", enum: ["PENDING_PAYMENT", "NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] },
        Order: order,
      },
    },
    paths: {
      "/orders": {
        get: {
          summary: "Lister les commandes",
          description: "Triées par date de mise à jour croissante. Pour synchroniser, relancez avec updated_since = updatedAt de la dernière commande reçue.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" }, description: "Liste séparée par des virgules, ex. NEW,ACCEPTED" },
            { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Valeur next_cursor de la page précédente" },
          ],
          responses: {
            "200": { description: "Commandes", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Order" } }, next_cursor: { type: ["string", "null"] } } } } } },
            "401": { description: "Clé invalide", content: { "application/json": { schema: error } } },
          },
        },
      },
      "/orders/{id}": {
        get: {
          summary: "Lire une commande",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Identifiant ou référence (YS-…)" }],
          responses: { "200": { description: "Commande", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Order" } } } } } }, "404": { description: "Introuvable", content: { "application/json": { schema: error } } } },
        },
      },
      "/orders/{id}/status": {
        post: {
          summary: "Changer le statut",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] }, note: { type: "string", description: "Obligatoire pour CANCELLED (motif)" } } } } },
          },
          responses: { "200": { description: "Commande mise à jour", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Order" } } } } } }, "409": { description: "Transition impossible", content: { "application/json": { schema: error } } } },
        },
      },
      "/menu": {
        get: {
          summary: "Lire le menu et les disponibilités",
          parameters: [{ name: "include_hidden", in: "query", schema: { type: "string", enum: ["1"] }, description: "Inclure les produits masqués" }],
          responses: { "200": { description: "Catégories et produits (prix en centimes TTC)" } },
        },
      },
    },
  };
}

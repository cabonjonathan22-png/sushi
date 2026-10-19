/**
 * Droits des rôles — vérifiés côté serveur sur chaque page, action et route d'API.
 *
 * - Super-admin : tout, y compris la configuration technique.
 * - Propriétaire : tous les restaurants, menus, réglages, compta, utilisateurs.
 * - Gérant : ses restaurants (menu, horaires, commandes, compta).
 * - Employé : commandes de son restaurant (voir, statut, imprimer) et ruptures.
 */

export type Role = "SUPER_ADMIN" | "OWNER" | "MANAGER" | "EMPLOYEE";

export type Permission =
  | "orders.view"
  | "orders.update" // changer le statut
  | "orders.print"
  | "orders.payment" // marquer réglé
  | "orders.refund"
  | "stock.toggle" // rupture en 1 clic
  | "menu.edit" // catalogue commun, catégories, produits, petits plus
  | "menu.restaurant" // surcharges par restaurant (prix, actif)
  | "promos.edit"
  | "customers.view" // fichier clients (données personnelles)
  | "restaurant.settings" // infos, horaires, zones, services, paiements, imprimantes
  | "restaurant.create"
  | "accounting.view"
  | "accounting.close"
  | "users.manage"
  | "audit.view"
  | "tech.config"; // clés Stripe, API, webhooks, réglages légaux

const MATRIX: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "orders.view", "orders.update", "orders.print", "orders.payment", "orders.refund", "stock.toggle",
    "menu.edit", "menu.restaurant", "promos.edit", "customers.view", "restaurant.settings", "restaurant.create",
    "accounting.view", "accounting.close", "users.manage", "audit.view", "tech.config",
  ],
  OWNER: [
    "orders.view", "orders.update", "orders.print", "orders.payment", "orders.refund", "stock.toggle",
    "menu.edit", "menu.restaurant", "promos.edit", "customers.view", "restaurant.settings", "restaurant.create",
    "accounting.view", "accounting.close", "users.manage", "audit.view", "tech.config",
  ],
  MANAGER: [
    "orders.view", "orders.update", "orders.print", "orders.payment", "orders.refund", "stock.toggle",
    "menu.edit", "menu.restaurant", "promos.edit", "customers.view", "restaurant.settings",
    "accounting.view", "accounting.close",
  ],
  EMPLOYEE: ["orders.view", "orders.update", "orders.print", "orders.payment", "stock.toggle"],
};

export interface Actor {
  id: string;
  role: Role;
  /** Restaurants assignés (ignoré pour super-admin et propriétaire). */
  restaurantIds: string[];
}

export function hasPermission(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return MATRIX[actor.role].includes(permission);
}

/** Accès à toutes les données d'un restaurant (super-admin / propriétaire : tous). */
export function canAccessRestaurant(actor: Actor, restaurantId: string): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "OWNER" || actor.restaurantIds.includes(restaurantId);
}

/** Droit + périmètre : c'est la vérification à utiliser partout. */
export function can(actor: Actor, permission: Permission, restaurantId?: string): boolean {
  if (!hasPermission(actor, permission)) return false;
  return restaurantId === undefined || canAccessRestaurant(actor, restaurantId);
}

/** Filtre Prisma : restaurants visibles par cet utilisateur. */
export function restaurantScope(actor: Actor): { id?: { in: string[] } } {
  return actor.role === "SUPER_ADMIN" || actor.role === "OWNER" ? {} : { id: { in: actor.restaurantIds } };
}

/** Un utilisateur ne peut créer / modifier que des comptes de rang inférieur (super-admin : tous). */
export function canManageRole(actor: Pick<Actor, "role">, target: Role): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "OWNER") return target === "MANAGER" || target === "EMPLOYEE" || target === "OWNER";
  return false;
}

/** Double authentification obligatoire pour ces rôles. */
export const REQUIRES_2FA: Role[] = ["SUPER_ADMIN", "OWNER"];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super-admin",
  OWNER: "Propriétaire",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
};

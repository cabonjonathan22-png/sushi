/** Données sérialisées envoyées aux composants client du parcours de commande. */
import type { MenuCategory, MenuProduct } from "@/lib/menu";
import type { PublicRestaurant } from "@/lib/restaurants";

export type ClientProduct = MenuProduct;
export type ClientCategory = MenuCategory;
export type ClientRestaurant = Omit<PublicRestaurant, "stripePublishableKey">;

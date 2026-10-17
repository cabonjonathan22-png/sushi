import { describe, expect, it } from "vitest";
import { baseName, originalUrl } from "./images.ts";
import { parseOrderPage } from "./orderPage.ts";
import { cleanText, htmlToText, mentionAlcool, slugify, toCents } from "./text.ts";
import { cleCommune, parseZones, type CommuneRef } from "./zones.ts";

describe("texte", () => {
  it("décode les entités et recompose les accents décomposés", () => {
    expect(cleanText("Kiyo Box &#8211; 36 pièces")).toBe("Kiyo Box – 36 pièces");
    expect(cleanText("Saumon For  Ever")).toBe("Saumon For Ever");
  });
  it("convertit le HTML en lignes", () => {
    expect(htmlToText("<p>3 sushi saumon,<br />\n6 maki</p>")).toBe("3 sushi saumon,\n6 maki");
  });
  it("produit des slugs ASCII stables", () => {
    expect(slugify("Tartare Daurade Avocat & Mangue")).toBe("tartare-daurade-avocat-et-mangue");
    expect(slugify("Salade d’algues wakamé")).toBe("salade-d-algues-wakame");
  });
  it("convertit les prix en centimes", () => {
    expect(toCents("1090")).toBe(1090);
    expect(() => toCents("abc")).toThrow();
  });
  it("détecte la mention alcool", () => {
    expect(mentionAlcool("L'abus d'alcool est dangereux pour la santé")).toBe(true);
    expect(mentionAlcool("Ginger beer sans alcool")).toBe(false);
  });
});

describe("images", () => {
  it("retrouve l'original à partir d'une miniature", () => {
    expect(originalUrl("https://x/2025/04/HAPPY_BOX_result-300x300.jpg")).toBe("https://x/2025/04/HAPPY_BOX_result.jpg");
    expect(originalUrl("https://x/a-b.png")).toBe("https://x/a-b.png");
  });
  it("garde le nom d'origine comme base de fichier", () => {
    expect(baseName("https://x/SAYTO-Soupe_Miso-235_D_result.jpg")).toBe("SAYTO-Soupe_Miso-235_D_result");
  });
});

describe("zones", () => {
  const ref: CommuneRef[] = [
    { nom: "Cadenet", code: "84026", codesPostaux: ["84160"] },
    { nom: "Lourmarin", code: "84068", codesPostaux: ["84160"] },
    { nom: "Cabrières-d'Aigues", code: "84024", codesPostaux: ["84240"] },
    { nom: "Lauris", code: "84065", codesPostaux: ["84360"] },
  ];
  it("tolère les coquilles de pluriel et d'accent", () => {
    expect(cleCommune("Cabriere d’aigues")).toBe(cleCommune("Cabrières-d'Aigues"));
  });
  it("lit communes et minimums, y compris plusieurs communes sur une ligne", () => {
    const zones = parseZones(
      ["ZONE 1", "Cabriere d’aigues", "Midi minimum 20€ d’achat", "Soir : minimum 35€ d’achat",
       "ZONE 2", "Cadenet Lourmarin", "Lauris", "Inconnuville", "Midi : minimum 20€ d’achat", "Soir : minimum 40€ d’achat"],
      ref,
    );
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ nom: "Zone 1", minimumMidi: 2000, minimumSoir: 3500 });
    expect(zones[0]!.communes.map((c) => c.codeInsee)).toEqual(["84024"]);
    expect(zones[1]!.communes.map((c) => c.nom).sort()).toEqual(["Cadenet", "Lauris", "Lourmarin"]);
    expect(zones[1]!.communesNonReconnues).toEqual(["Inconnuville"]);
    expect(zones[1]!.minimumSoir).toBe(4000);
  });
});

describe("page de commande", () => {
  const carte = (id: number, extra = "") => `<div class="orderable-products-list__item">
<div
	class="orderable-product orderable-product--add-to-cart"
	data-orderable-product-id="${id}">${extra}
<h2 class="orderable-product__title">P${id}</h2>
<p class="orderable-product__description">Desc ${id}</p>
<button data-orderable-product-id="${id}">Ajouter</button></div></div>`;
  const label = `<span class="orderable-pro-product-labels__label orderable-pro-product-labels__label-vegetarien" style="color:#fafafa;background-color:#3f992f" title=""><i></i><span class="orderable-pro-product-labels__text">
 Végétarien </span></span>`;
  const html = `<div id="category-entrees">${carte(3)}${carte(1, label)}</div>
<div id="category-boissons">${carte(9).replace("Desc 9", "33cl<br/>L'abus d'alcool est dangereux pour la santé")}</div>`;

  it("restitue l'ordre des catégories et des produits", () => {
    const p = parseOrderPage(html);
    expect(p.categories).toEqual(["entrees", "boissons"]);
    expect(p.products.map((x) => [x.categorySlug, x.wpId, x.position])).toEqual([
      ["entrees", 3, 0], ["entrees", 1, 1], ["boissons", 9, 0],
    ]);
  });
  it("rattache badges et mention alcool au bon produit", () => {
    const p = parseOrderPage(html);
    expect(p.products[0]!.labels).toEqual([]);
    expect(p.products[1]!.labels).toEqual([{ slug: "vegetarien", texte: "Végétarien", couleur: "#fafafa", fond: "#3f992f" }]);
    expect(p.products[2]!.alcool).toBe(true);
  });
});

import { slugify } from "./text.ts";
import type { Zone } from "../schema.ts";

export interface CommuneRef {
  nom: string;
  code: string;
  codesPostaux: string[];
}

/** Clé de comparaison tolérante : sans accents, sans « s » final de chaque mot (« Cabriere » = « Cabrières »). */
export function cleCommune(nom: string): string {
  return slugify(nom)
    .split("-")
    .map((w) => w.replace(/s$/, ""))
    .join("-");
}

/**
 * Lit les blocs « ZONE n » de la page d'accueil (texte brut, une info par ligne) :
 * communes, minimum midi et minimum soir. Une ligne peut contenir plusieurs
 * communes (« Cadenet Lourmarin ») : on cherche donc les noms officiels dans le bloc.
 */
export function parseZones(lignes: string[], communes: CommuneRef[]): Zone[] {
  const zones: Zone[] = [];
  const index = communes
    .map((c) => ({ c, cle: cleCommune(c.nom) }))
    .sort((a, b) => b.cle.length - a.cle.length); // les noms longs d'abord

  for (let i = 0; i < lignes.length; i++) {
    const titre = lignes[i]!.match(/^zone\s*(\d+)$/i);
    if (!titre) continue;
    const bloc: string[] = [];
    let midi: number | null = null;
    let soir: number | null = null;
    for (let j = i + 1; j < lignes.length && !/^zone\s*\d+$/i.test(lignes[j]!); j++) {
      const l = lignes[j]!;
      const montant = l.match(/(\d+(?:[.,]\d+)?)\s*€/);
      if (montant && /midi/i.test(l)) midi = Math.round(Number(montant[1]!.replace(",", ".")) * 100);
      else if (montant && /soir/i.test(l)) soir = Math.round(Number(montant[1]!.replace(",", ".")) * 100);
      else if (montant) break;
      else bloc.push(l);
      if (soir !== null) break;
    }

    const trouvees: Zone["communes"] = [];
    const nonReconnues: string[] = [];
    for (const ligne of bloc) {
      let reste = `-${cleCommune(ligne)}-`;
      let trouve = false;
      for (const { c, cle } of index) {
        if (reste.includes(`-${cle}-`)) {
          reste = reste.replace(`-${cle}-`, "-");
          trouve = true;
          for (const cp of c.codesPostaux) trouvees.push({ nom: c.nom, codeInsee: c.code, codePostal: cp });
        }
      }
      if (!trouve) nonReconnues.push(ligne);
    }
    zones.push({
      nom: `Zone ${titre[1]}`,
      communes: trouvees,
      communesNonReconnues: nonReconnues,
      minimumMidi: midi,
      minimumSoir: soir,
      // Livraison actuellement annoncée gratuite : frais 0, pas de seuil.
      fraisLivraison: 0,
      seuilLivraisonGratuite: null,
    });
  }
  return zones;
}

import { describe, expect, it } from "vitest";
import { buildFecLines, fecText, prorate, type AccountingAccounts, type FecSale } from "../accounting-fec";
import { zonedTime } from "../time";

const ACC: AccountingAccounts = {
  journalCode: "VE", journalLabel: "Ventes",
  sales: { "550": "707055", "1000": "707100", "2000": "707200" },
  vat: { "550": "445711", "1000": "445712", "2000": "445713" },
  payment: { CASH: "530000", ONLINE_CARD: "467100", CARD_TERMINAL: "511500" },
  defaultSales: "707000", defaultVat: "445700", defaultPayment: "471000",
  roundingDebit: "658000", roundingCredit: "758000",
};
const LABELS = { CASH: "Espèces", ONLINE_CARD: "Carte en ligne", CARD_TERMINAL: "Carte (TPE)" };

const sale = (date: string, method: string, lines: [number, number, number][]): FecSale => ({
  slotStart: zonedTime(date, "12:00"),
  reference: `YS-${date}-${method}`,
  paymentMethod: method,
  totalCents: lines.reduce((a, [, b, v]) => a + b + v, 0),
  vatBreakdown: lines.map(([rate, baseCents, vatCents]) => ({ rate, baseCents, vatCents, totalCents: baseCents + vatCents })),
});

const balanced = (lines: ReturnType<typeof buildFecLines>) => {
  const by = new Map<string, number>();
  for (const l of lines) by.set(l.ecritureNum, (by.get(l.ecritureNum) ?? 0) + l.debit - l.credit);
  return [...by.values()].every((v) => v === 0);
};

describe("écritures FEC", () => {
  it("une écriture équilibrée par jour : trésorerie au débit, ventes HT et TVA au crédit", () => {
    const lines = buildFecLines([
      sale("2026-10-20", "CASH", [[1000, 2000, 200]]),
      sale("2026-10-20", "ONLINE_CARD", [[1000, 1000, 100], [2000, 500, 100]]),
      sale("2026-10-21", "CASH", [[550, 1000, 55]]),
    ], [], ACC, LABELS);
    expect(new Set(lines.map((l) => l.ecritureNum))).toEqual(new Set(["VE20261020", "VE20261021"]));
    expect(balanced(lines)).toBe(true);
    const day1 = lines.filter((l) => l.ecritureNum === "VE20261020");
    expect(day1.find((l) => l.compteNum === "530000")?.debit).toBe(2200);
    expect(day1.find((l) => l.compteNum === "467100")?.debit).toBe(1700);
    expect(day1.find((l) => l.compteNum === "707100")?.credit).toBe(3000);
    expect(day1.find((l) => l.compteNum === "445713")?.credit).toBe(100);
  });

  it("un avoir passe l'écriture inverse, ventilée par taux, et reste équilibré", () => {
    const order = sale("2026-10-20", "ONLINE_CARD", [[1000, 1000, 100], [2000, 500, 100]]);
    const lines = buildFecLines([], [{ createdAt: zonedTime("2026-10-22", "10:00"), creditNumber: "AV-1", amountCents: 1000, order }], ACC, LABELS);
    expect(balanced(lines)).toBe(true);
    expect(lines.find((l) => l.compteNum === "467100")?.credit).toBe(1000);
    expect(lines.filter((l) => l.debit > 0).reduce((a, l) => a + l.debit, 0)).toBe(1000);
  });

  it("solde un écart d'arrondi sur le compte d'arrondi", () => {
    const s = sale("2026-10-20", "CASH", [[1000, 909, 91]]);
    s.totalCents = 1001; // ventilation TVA à 1 centime près
    const lines = buildFecLines([s], [], ACC, LABELS);
    expect(balanced(lines)).toBe(true);
    expect(lines.find((l) => l.compteNum === "758000")?.credit).toBe(1);
  });

  it("répartit au prorata au centime près", () => {
    expect(prorate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(prorate(1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("produit un fichier FEC à 18 colonnes, montants à virgule", () => {
    const txt = fecText(buildFecLines([sale("2026-10-20", "CASH", [[1000, 2000, 200]])], [], ACC, LABELS));
    const [head, first] = txt.split("\r\n");
    expect(head!.split("\t")).toHaveLength(18);
    expect(first!.split("\t")).toHaveLength(18);
    expect(first).toContain("22,00");
  });
});

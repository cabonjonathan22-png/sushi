import { renderText, type Ticket } from "./ticket";

/**
 * ESC/POS (Epson, Star en émulation, Xprinter, Bixolon… : la quasi-totalité des
 * imprimantes thermiques). Accents français via la page de code CP858.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Caractères CP858 utiles en français (le reste de l'ASCII est inchangé). */
const CP858: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "ç": 0x87, "ê": 0x88, "ë": 0x89,
  "è": 0x8a, "ï": 0x8b, "î": 0x8c, "Ä": 0x8e, "É": 0x90, "ô": 0x93, "ö": 0x94, "û": 0x96, "ù": 0x97,
  "Ü": 0x9a, "£": 0x9c, "°": 0xf8, "€": 0xd5, "È": 0xd4, "Ê": 0xd2, "Ë": 0xd3, "Î": 0xd7, "Ï": 0xd8,
  "Ô": 0xe2, "Ù": 0xeb, "Û": 0xea, "À": 0xb7, "Â": 0xb6, "œ": 0x6f, "Œ": 0x4f, "’": 0x27, "–": 0x2d,
  "—": 0x2d, "«": 0xae, "»": 0xaf, " ": 0x20, " ": 0x20,
};

export function encodeCp858(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) out.push(code);
    else if (CP858[ch] !== undefined) out.push(CP858[ch]!);
    else {
      // Lettre accentuée non prévue : on retire l'accent.
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out.push(base.charCodeAt(0) < 0x80 ? base.charCodeAt(0) : 0x3f);
    }
  }
  return out;
}

export function renderEscPos(t: Ticket, cols: number, copies = 1): Buffer {
  const bytes: number[] = [];
  const cmd = (...b: number[]) => bytes.push(...b);
  const line = (s: string) => bytes.push(...encodeCp858(s), 0x0a);

  for (let c = 0; c < Math.max(1, copies); c++) {
    cmd(ESC, 0x40); // initialisation
    cmd(ESC, 0x74, 19); // page de code CP858
    for (const l of t.lines) {
      switch (l.kind) {
        case "title":
        case "big":
          cmd(ESC, 0x61, 1, ESC, 0x45, 1, GS, 0x21, l.kind === "title" ? 0x22 : 0x11);
          line(l.text);
          cmd(GS, 0x21, 0, ESC, 0x45, 0, ESC, 0x61, 0);
          break;
        case "center":
          cmd(ESC, 0x61, 1);
          line(l.text);
          cmd(ESC, 0x61, 0);
          break;
        case "text":
          if (l.bold) cmd(ESC, 0x45, 1);
          for (const s of renderText({ lines: [l] }, cols).split("\n")) line(s);
          if (l.bold) cmd(ESC, 0x45, 0);
          break;
        case "item": {
          const [head, ...rest] = renderText({ lines: [l] }, cols).split("\n");
          cmd(ESC, 0x45, 1, GS, 0x21, 0x01); // gras, double hauteur
          line(head!);
          cmd(GS, 0x21, 0, ESC, 0x45, 0);
          for (const s of rest) line(s);
          break;
        }
        case "pair":
          if (l.bold) cmd(ESC, 0x45, 1, GS, 0x21, 0x01);
          line(renderText({ lines: [l] }, cols));
          if (l.bold) cmd(GS, 0x21, 0, ESC, 0x45, 0);
          break;
        case "rule":
          line("-".repeat(cols));
          break;
        case "feed":
          cmd(ESC, 0x64, 4);
          break;
      }
    }
    cmd(GS, 0x56, 66, 0); // coupe partielle après avance
  }
  return Buffer.from(bytes);
}

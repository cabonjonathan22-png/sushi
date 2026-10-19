import { describe, expect, it } from "vitest";
import { INDEFINITE, pauseUntilText } from "../pause";
import { zonedTime } from "../time";

const t = (key: string, vars: Record<string, string> = {}) => `${key}(${Object.values(vars).join(",")})`;
const now = zonedTime("2026-10-19", "12:00");

describe("fermeture des commandes", () => {
  it("jusqu'à nouvel ordre", () => expect(pauseUntilText(INDEFINITE, t, "fr", "Europe/Paris", now)).toBe("pause.untilFurther()"));
  it("jusqu'à une heure du jour", () => expect(pauseUntilText(zonedTime("2026-10-19", "14:30"), t, "fr", "Europe/Paris", now)).toBe("pause.untilTime(14:30)"));
  it("jusqu'à une date incluse (fin à minuit)", () => expect(pauseUntilText(zonedTime("2026-10-22", "00:00"), t, "fr", "Europe/Paris", now)).toBe("pause.untilDay(mercredi 21 octobre)"));
  it("minuit reconnu aussi en anglais (horloge 12 h)", () => expect(pauseUntilText(zonedTime("2026-10-23", "00:00"), t, "en", "Europe/Paris", now)).toBe("pause.untilDay(Thursday, October 22)"));
  it("jusqu'à un autre jour à une heure", () => expect(pauseUntilText(zonedTime("2026-10-20", "06:00"), t, "fr", "Europe/Paris", now)).toBe("pause.untilDateTime(mardi 20 octobre,06:00)"));
});

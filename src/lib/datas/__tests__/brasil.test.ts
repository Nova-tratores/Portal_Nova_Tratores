import { describe, it, expect } from "vitest";
import { dataHoraBR, horaBR, partesBR } from "../brasil";

describe("hora de Brasília", () => {
  it("11:45 UTC = 08:45 em Brasília", () => {
    const d = new Date("2026-10-27T11:45:44Z");
    expect(dataHoraBR(d)).toBe("27/10/2026 08:45");
    expect(horaBR(d)).toBe(8);
  });
  it("01:30 UTC ainda é o dia anterior em Brasília", () => {
    const p = partesBR(new Date("2026-10-28T01:30:00Z"));
    expect(`${p.dia}/${p.mes} ${p.hora}:${p.min}`).toBe("27/10 22:30");
  });
});

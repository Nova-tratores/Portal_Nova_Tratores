import { describe, expect, it } from "vitest";
import { formatarDuracao, segundosDesde } from "../tempo";

describe("tempo", () => {
  it("formatarDuracao", () => {
    expect(formatarDuracao(0)).toBe("00:00");
    expect(formatarDuracao(65)).toBe("01:05");
    expect(formatarDuracao(3725)).toBe("1:02:05");
    expect(formatarDuracao(-5)).toBe("00:00");
  });
  it("segundosDesde", () => {
    const agora = Date.parse("2026-09-10T15:00:00Z");
    expect(segundosDesde("2026-09-10T14:58:30Z", agora)).toBe(90);
    expect(segundosDesde("2026-09-10T15:01:00Z", agora)).toBe(0);
    expect(segundosDesde(null, agora)).toBe(0);
    expect(segundosDesde("x", agora)).toBe(0);
  });
});

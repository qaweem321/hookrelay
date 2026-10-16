import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatNextTry,
  formatPercent,
  formatRelative,
} from "./format";
import { loginUrl, safeNext } from "./next";

describe("dates", () => {
  it("spells out the month and uses UTC", () => {
    expect(formatDate("2026-10-11T23:30:00-05:00")).toBe("Oct 12, 2026");
    expect(formatDateTime("2026-10-11T04:05:06Z")).toBe("Oct 11, 2026, 04:05:06 UTC");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(formatRelative("2026-10-11T00:00:30Z", now)).toBe("in 30 s");
    expect(formatRelative("2026-10-10T22:00:00Z", now)).toBe("2 h ago");
    expect(formatNextTry("2026-10-11T00:05:00Z", now)).toBe("next in 5 min");
    expect(formatNextTry("2026-10-10T23:59:59Z", now)).toBe("due now");
  });
});

describe("numbers", () => {
  it("formats sizes and percentages", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatPercent(null)).toBe("–");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.9876)).toBe("98.8%");
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/events?sourceId=1")).toBe("/events?sourceId=1");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });

  it("builds login links that return to the page", () => {
    expect(loginUrl("/events/abc")).toBe("/login?next=%2Fevents%2Fabc");
    expect(loginUrl("/login")).toBe("/login");
  });
});

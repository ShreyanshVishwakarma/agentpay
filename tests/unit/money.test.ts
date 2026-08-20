import { describe, expect, it } from "vitest";
import { formatPaise, rupeesToPaise } from "@/lib/money";

describe("formatPaise", () => {
  it("formats a simple amount", () => {
    expect(formatPaise(79800)).toBe("₹798.00");
  });

  it("uses Indian digit grouping for thousands", () => {
    expect(formatPaise(119700)).toBe("₹1,197.00");
  });

  it("preserves paise precision", () => {
    expect(formatPaise(199)).toBe("₹1.99");
  });

  it("formats zero without sign issues", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
});

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise(800)).toBe(80000);
  });

  it("rounds fractional rupees to the nearest paisa instead of floating-point drift", () => {
    expect(rupeesToPaise(10.10)).toBe(1010);
    expect(rupeesToPaise(0.29)).toBe(29);
    expect(rupeesToPaise(19.99)).toBe(1999);
  });
});

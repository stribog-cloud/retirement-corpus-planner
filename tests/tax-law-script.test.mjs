import { describe, expect, it } from "vitest";
import { deriveTaxLawFromText, normaliseText } from "../scripts/derive-tax-law.mjs";

describe("tax-law candidate scraper", () => {
  it("derives a reviewable candidate ruleset only when official markers are present", () => {
    const html = `
      <h2>Tax Slabs for AY 2026-27</h2>
      <p>Up to ₹ 4,00,000 Nil</p>
      <p>₹ 20,00,001 - ₹ 24,00,000</p>
      <p>Applicable Rebate u/s 87A ₹ 60,000 Taxable income shall not exceed 12,00,000</p>
      <p>Health & Education cess @ 4%</p>
    `;
    const law = deriveTaxLawFromText(normaliseText(html), "https://example.test/tax");
    expect(law.sourceUrl).toBe("https://example.test/tax");
    expect(law.newRegimeSlabs).toHaveLength(7);
    expect(law.newRegimeSlabs[0]).toEqual({ upto: 400000, rate: 0 });
    expect(law.oldRegimeSlabs.senior[0]).toEqual({ upto: 300000, rate: 0 });
    expect(law.oldRegimeSlabs.superSenior[0]).toEqual({ upto: 500000, rate: 0 });
    expect(law.rebates.new).toMatchObject({ threshold: 1200000, max: 60000 });
    expect(law.deductions.section80TTB).toMatchObject({ max: 50000 });
    expect(law.surchargeBands).toHaveLength(4);
    expect(law.surchargeBands.at(-1)).toMatchObject({ above: 50000000, oldRegimeRate: 37, specialRateCap: 15 });
    expect(law.cess).toBe(4);
    expect(law.notes).toContain("candidate");
  });

  it("rejects source text that cannot be verified against expected markers", () => {
    expect(() => deriveTaxLawFromText("Tax Slabs for AY 2026-27 only")).toThrow("Official source markers not found");
  });
});

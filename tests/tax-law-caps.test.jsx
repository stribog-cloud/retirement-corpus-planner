/**
 * tests/tax-law-caps.test.jsx
 *
 * fin-8fb.11 MAJOR (rt-security #2, §4.2) — bounded resource consumption for
 * user-pasted tax-law JSON.
 *
 * sanitizeTaxLaw (and its cleanSlabArray / cleanSurchargeBands /
 * cleanProductTaxRules helpers) previously had no cap on array length or
 * object key count. An adversarial tax-law paste (e.g. a multi-million-entry
 * slab array) inflates iteration cost on slabTaxBeforeCess's hot path, which
 * runs once per Monte Carlo sample-year. The caps added in src/model.js are
 * generous (64 slab bands, 32 surcharge bands, 64 product-rule keys, 2000
 * chars per free-text field) — far above any real ruleset (DEFAULT_TAX_LAW's
 * largest array is 7 entries) — so they must never change behavior for a
 * legitimate tax-law edit.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  DEFAULT_TAX_LAW,
  sanitizeTaxLaw,
  formatTaxLawJson,
  slabTaxBeforeCess
} from "../src/model.js";

describe("fin-8fb.11 MAJOR — tax-law sanitizer array/key/text caps", () => {
  it("a 100,000-entry slab array is capped to 64 bands, and slabTaxBeforeCess stays fast on the capped law", () => {
    const hugeSlabs = Array.from({ length: 100000 }, (_, i) => ({ upto: (i + 1) * 100, rate: 5 }));
    const law = sanitizeTaxLaw({ ...DEFAULT_TAX_LAW, newRegimeSlabs: hugeSlabs });

    expect(law.newRegimeSlabs.length).toBeLessThanOrEqual(64);

    const params = { ...BASE, taxLawJson: formatTaxLawJson(law) };
    const start = performance.now();
    for (let i = 0; i < 1000; i++) slabTaxBeforeCess(500000 + i, params);
    const elapsedMs = performance.now() - start;
    // 1000 calls over a (correctly capped) <=64-band table should be well
    // under a second; an uncapped 100,000-band table (pre-fix) would blow
    // well past this on the same hardware (rt-security measured ~19ms for a
    // single call on a 2,000,000-band table).
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("a 2,000-entry surcharge-band array is capped to 32 bands", () => {
    const hugeSurcharge = Array.from({ length: 2000 }, (_, i) => ({ above: (i + 1) * 1000000, upto: (i + 2) * 1000000, rate: 10 }));
    const law = sanitizeTaxLaw({ ...DEFAULT_TAX_LAW, surchargeBands: hugeSurcharge });
    expect(law.surchargeBands.length).toBeLessThanOrEqual(32);
  });

  it("a 5,000-key productTaxRules object is capped to 64 processed keys", () => {
    const hugeRules = {};
    for (let i = 0; i < 5000; i++) hugeRules[`custom${i}`] = { longTermMonths: 24 };
    const law = sanitizeTaxLaw({ ...DEFAULT_TAX_LAW, productTaxRules: hugeRules });
    const fallbackKeyCount = Object.keys(DEFAULT_TAX_LAW.productTaxRules).length;
    expect(Object.keys(law.productTaxRules).length).toBeLessThanOrEqual(fallbackKeyCount + 64);
  });

  it("a 5,000-char version string is truncated to 2,000 characters", () => {
    const law = sanitizeTaxLaw({ ...DEFAULT_TAX_LAW, version: "x".repeat(5000) });
    expect(law.version.length).toBe(2000);
  });

  it("DEFAULT_TAX_LAW round-trips through sanitizeTaxLaw with every band/key preserved (the caps never touch a real ruleset)", () => {
    const sanitized = sanitizeTaxLaw(DEFAULT_TAX_LAW);

    expect(sanitized.newRegimeSlabs.length).toBe(DEFAULT_TAX_LAW.newRegimeSlabs.length);
    expect(sanitized.oldRegimeSlabs.below60.length).toBe(DEFAULT_TAX_LAW.oldRegimeSlabs.below60.length);
    expect(sanitized.oldRegimeSlabs.senior.length).toBe(DEFAULT_TAX_LAW.oldRegimeSlabs.senior.length);
    expect(sanitized.oldRegimeSlabs.superSenior.length).toBe(DEFAULT_TAX_LAW.oldRegimeSlabs.superSenior.length);
    expect(sanitized.surchargeBands.length).toBe(DEFAULT_TAX_LAW.surchargeBands.length);
    expect(Object.keys(sanitized.productTaxRules).length).toBe(Object.keys(DEFAULT_TAX_LAW.productTaxRules).length);
    expect(sanitized.version).toBe(DEFAULT_TAX_LAW.version);
    expect(sanitized.notes).toBe(DEFAULT_TAX_LAW.notes);

    // Sanitizing DEFAULT_TAX_LAW directly must match sanitizing its
    // JSON-round-tripped form (exactly the path taxLawFromState takes for
    // taxLawJson) -- proves the capped sanitizer behaves identically whether
    // fed the JS object or its serialized form, for a real ruleset.
    const sanitizedFromJson = sanitizeTaxLaw(JSON.parse(formatTaxLawJson(DEFAULT_TAX_LAW)));
    expect(sanitizedFromJson).toEqual(sanitized);
  });
});

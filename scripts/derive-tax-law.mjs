#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE = "https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function normaliseText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8377;|&\#x20b9;/gi, "₹")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function requireMarkers(text, markers) {
  const missing = markers.filter((marker) => !text.includes(marker));
  if (missing.length) {
    throw new Error(`Official source markers not found: ${missing.join(", ")}`);
  }
}

function deriveTaxLawFromText(text, sourceUrl = DEFAULT_SOURCE) {
  requireMarkers(text, [
    "Tax Slabs for AY",
    "Up to ₹ 4,00,000",
    "₹ 20,00,001",
    "₹ 60,000",
    "Taxable income shall not exceed 12,00,000",
    "Health & Education cess @ 4%"
  ]);

  return {
    version: "Candidate derived from Income Tax Department AY 2026-27 page",
    source: "Income Tax Department public guidance; generated candidate, review before applying",
    sourceUrl,
    updatedOn: new Date().toISOString().slice(0, 10),
    newRegimeSlabs: [
      { upto: 400000, rate: 0 },
      { upto: 800000, rate: 5 },
      { upto: 1200000, rate: 10 },
      { upto: 1600000, rate: 15 },
      { upto: 2000000, rate: 20 },
      { upto: 2400000, rate: 25 },
      { upto: null, rate: 30 }
    ],
    oldRegimeSlabs: {
      below60: [
        { upto: 250000, rate: 0 },
        { upto: 500000, rate: 5 },
        { upto: 1000000, rate: 20 },
        { upto: null, rate: 30 }
      ],
      senior: [
        { upto: 300000, rate: 0 },
        { upto: 500000, rate: 5 },
        { upto: 1000000, rate: 20 },
        { upto: null, rate: 30 }
      ],
      superSenior: [
        { upto: 500000, rate: 0 },
        { upto: 1000000, rate: 20 },
        { upto: null, rate: 30 }
      ]
    },
    rebates: {
      new: { threshold: 1200000, max: 60000, marginalRelief: true },
      old: { threshold: 500000, max: 12500, marginalRelief: false }
    },
    deductions: {
      section80TTB: {
        max: 50000,
        appliesTo: "resident senior/super-senior old-regime deposit interest"
      }
    },
    specialRates: {
      equityLtcg: 12.5,
      equityStcg: 20,
      listedBondLtcg: 12.5
    },
    surchargeBands: [
      { above: 5000000, upto: 10000000, rate: 10, oldRegimeRate: 10, specialRateCap: 15 },
      { above: 10000000, upto: 20000000, rate: 15, oldRegimeRate: 15, specialRateCap: 15 },
      { above: 20000000, upto: 50000000, rate: 25, oldRegimeRate: 25, specialRateCap: 15 },
      { above: 50000000, upto: null, rate: 25, oldRegimeRate: 37, specialRateCap: 15 }
    ],
    surchargeMarginalRelief: true,
    equityLtcgExemption: 125000,
    equityLongTermMonths: 12,
    listedBondLongTermMonths: 12,
    cess: 4,
    debtMfTaxation: "slab",
    notes: "Generated from official page markers. This is a candidate ruleset; review Finance Act/CBDT changes and CA guidance before applying."
  };
}

async function main() {
  const sourceUrl = argValue("--source") || DEFAULT_SOURCE;
  const out = argValue("--out");
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
  const html = await response.text();
  const rules = deriveTaxLawFromText(normaliseText(html), sourceUrl);
  const json = `${JSON.stringify(rules, null, 2)}\n`;
  if (out) {
    await writeFile(out, json, "utf8");
    console.error(`Wrote candidate tax law ruleset to ${out}`);
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { deriveTaxLawFromText, normaliseText };

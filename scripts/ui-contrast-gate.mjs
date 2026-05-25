import { readFile } from "node:fs/promises";

const css = await readFile("src/styles.css", "utf8");

function blockFor(selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] || "";
}

function token(block, name) {
  const match = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
  return match?.[1] || "";
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
}

function linear(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const high = Math.max(l1, l2);
  const low = Math.min(l1, l2);
  return (high + 0.05) / (low + 0.05);
}

const root = blockFor(":root");
const dark = blockFor('[data-theme="dark"]');
const checks = [
  { label: "light text on background", fg: token(root, "--text"), bg: token(root, "--bg") },
  { label: "light muted on background", fg: token(root, "--muted"), bg: token(root, "--bg") },
  { label: "dark text on background", fg: token(dark, "--text"), bg: token(dark, "--bg") },
  { label: "dark muted on background", fg: token(dark, "--muted"), bg: token(dark, "--bg") },
  { label: "light danger on background", fg: token(root, "--danger"), bg: token(root, "--bg") },
  { label: "dark warning on background", fg: token(dark, "--warning"), bg: token(dark, "--bg") }
];

const failures = [];
for (const check of checks) {
  if (!check.fg || !check.bg) {
    failures.push(`${check.label}: missing token value`);
    continue;
  }
  const ratio = contrast(check.fg, check.bg);
  if (ratio < 3.0 && /danger|warning/.test(check.label)) {
    failures.push(`${check.label}: semantic signal contrast ${ratio.toFixed(2)} below 3.0`);
  } else if (!/danger|warning/.test(check.label) && ratio < 4.5) {
    failures.push(`${check.label}: text contrast ${ratio.toFixed(2)} below 4.5`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: "ui-contrast",
  ratios: checks.map((check) => ({ label: check.label, ratio: Number(contrast(check.fg, check.bg).toFixed(2)) }))
}, null, 2));

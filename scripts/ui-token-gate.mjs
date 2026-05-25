import { readFile } from "node:fs/promises";

const css = await readFile("src/styles.css", "utf8");
const failures = [];

const requiredTokens = [
  "--bg",
  "--bg-2",
  "--rail",
  "--panel",
  "--panel-2",
  "--panel-3",
  "--text",
  "--muted",
  "--line",
  "--line-strong",
  "--grid",
  "--mesh-line",
  "--teal",
  "--coral",
  "--gold",
  "--blue",
  "--success",
  "--warning",
  "--danger",
  "--income",
  "--tax",
  "--growth",
  "--risk",
  "--focus-ring",
  "--glass-edge",
  "--surface-glow",
  "--shadow",
  "--soft-shadow",
  "--radius",
  "--display",
  "--body",
  "--font-scale"
];

for (const token of requiredTokens) {
  const rootPattern = new RegExp(`${token}\\s*:`);
  if (!rootPattern.test(css)) failures.push(`missing token ${token}`);
}

if (!/\[data-theme="dark"\]\s*\{/.test(css)) {
  failures.push("missing dark theme token layer");
}

if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) {
  failures.push("missing reduced-motion policy");
}

if (!/@media\s*\(forced-colors:\s*active\)/.test(css)) {
  failures.push("missing forced-colors policy");
}

if (/@import\s+url\(/.test(css)) {
  failures.push("external font/style imports are not allowed in the self-contained artifact");
}

if (!css.includes("color-mix(")) {
  failures.push("glass/material system should use semantic token mixing");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "ui-tokens", tokens: requiredTokens.length }, null, 2));

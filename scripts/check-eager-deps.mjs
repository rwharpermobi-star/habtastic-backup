#!/usr/bin/env node
/**
 * Guard: heavy chunks (Recharts, Coach page, Winston voice, PDF export) must
 * NEVER be part of the eager startup graph. If a top-level import in shared
 * code leaks them in, first paint balloons.
 *
 * This walks the REAL static import graph from the entry chunk instead of
 * grepping the entry file. String-grepping used to miss the worst class of
 * regression: a tiny shared module (e.g. `clsx`) getting parked inside
 * `charts-vendor`, which made the entry chunk statically import all of
 * Recharts (~374 kB) without the word "recharts" ever appearing in it.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "dist/assets";

// Chunk-name fragments that must not be reachable via *static* imports
// from the entry chunk.
const FORBIDDEN_CHUNKS = [
  { needle: "charts-vendor", hint: "Recharts must stay behind a lazy route" },
  { needle: "jspdf", hint: "PDF export must stay behind a dynamic import()" },
  { needle: "html2canvas", hint: "html2canvas must stay behind a dynamic import()" },
  { needle: "Coach-", hint: "The Coach route must stay lazy" },
  { needle: "useWinstonVoice", hint: "Winston voice must load with the Coach route" },
  { needle: "motion-vendor", hint: "framer-motion must load with the first lazy route, not the splash screen" },
  {
    needle: "supabase-vendor",
    hint: "@supabase/supabase-js must load after first paint — eager modules use getSupabase() from src/integrations/supabase/lazyClient.ts",
  },
];

// Total uncompressed JS pulled in before first paint. Measured baseline after
// the clsx/charts, framer-motion and lazy-Supabase fixes was 513 kB; leave a
// little headroom, not a blank cheque.
const EAGER_BUDGET_KB = 560;

let entryFile;
try {
  const html = readFileSync("dist/index.html", "utf8");
  entryFile = html.match(/\/assets\/(index-[^"']+\.js)/)?.[1];
} catch {
  console.error("[check-eager-deps] Cannot read dist/index.html. Did you run `bun run build`?");
  process.exit(2);
}
if (!entryFile) {
  console.error("[check-eager-deps] No entry index-*.js referenced by dist/index.html.");
  process.exit(2);
}

// Walk static `from"./chunk.js"` edges only. Dynamic `import("./chunk.js")`
// edges are intentionally ignored — those are the lazy ones.
const eager = new Set([entryFile]);
const queue = [entryFile];
while (queue.length) {
  const file = queue.pop();
  let src;
  try {
    src = readFileSync(join(ASSETS, file), "utf8");
  } catch {
    continue;
  }
  for (const m of src.matchAll(/from\s*"\.\/([^"]+\.js)"/g)) {
    if (!eager.has(m[1])) {
      eager.add(m[1]);
      queue.push(m[1]);
    }
  }
}

const breaches = [];
for (const { needle, hint } of FORBIDDEN_CHUNKS) {
  const hit = [...eager].find((f) => f.includes(needle));
  if (hit) breaches.push(`${hit} (matched "${needle}"): ${hint}`);
}

let totalBytes = 0;
for (const f of eager) {
  try {
    totalBytes += statSync(join(ASSETS, f)).size;
  } catch { /* ignore */ }
}
const totalKb = totalBytes / 1024;

if (breaches.length) {
  console.error("[check-eager-deps] Heavy chunks reachable from the entry chunk:");
  for (const b of breaches) console.error(`  - ${b}`);
  console.error(
    "\nUsually caused by a shared module being grouped into a heavy manualChunk. " +
      "Give the shared module its own chunk (see `utils-vendor` in vite.config.ts) " +
      "or move the import inside React.lazy() / dynamic import().",
  );
  process.exit(1);
}

if (totalKb > EAGER_BUDGET_KB) {
  console.error(
    `[check-eager-deps] Eager startup JS is ${totalKb.toFixed(0)} kB, over the ${EAGER_BUDGET_KB} kB budget.`,
  );
  console.error("Eager chunks:\n  " + [...eager].join("\n  "));
  process.exit(1);
}

console.log(
  `[check-eager-deps] OK — ${eager.size} eager chunks, ${totalKb.toFixed(0)} kB (budget ${EAGER_BUDGET_KB} kB).`,
);

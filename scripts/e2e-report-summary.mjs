#!/usr/bin/env node
/**
 * Turns Playwright JSON results into a GitHub Actions run summary so a red E2E
 * run tells you which specs failed — and which trace file to open — without
 * downloading anything first.
 *
 * Usage: node scripts/e2e-report-summary.mjs <label> <results.json> [...more]
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const [label = "Playwright", ...files] = process.argv.slice(2);
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const lines = [];
const write = (line = "") => lines.push(line);

const collectSpecs = (suite, out = []) => {
  for (const spec of suite.specs ?? []) out.push(spec);
  for (const child of suite.suites ?? []) collectSpecs(child, out);
  return out;
};

let totalFailed = 0;
let totalPassed = 0;
let sawResults = false;

for (const file of files) {
  if (!existsSync(file)) continue;
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    write(`> Could not parse \`${file}\`: ${error.message}`);
    continue;
  }
  sawResults = true;

  const specs = (report.suites ?? []).flatMap((suite) => collectSpecs(suite));
  const failures = [];
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const passed = test.status === "expected" || test.status === "flaky";
      if (passed) totalPassed += 1;
      if (test.status === "expected") continue;
      if (test.status === "skipped") continue;
      const last = test.results?.[test.results.length - 1] ?? {};
      const attachments = (last.attachments ?? [])
        .filter((a) => ["trace", "video", "screenshot"].includes(a.name))
        .map((a) => `${a.name}: \`${a.path ? path.relative(process.cwd(), a.path) : ""}\``);
      failures.push({
        title: `${spec.file}:${spec.line} › ${spec.title}`,
        project: test.projectName ?? "",
        status: test.status,
        retries: (test.results?.length ?? 1) - 1,
        error: (last.error?.message ?? "").split("\n").slice(0, 3).join(" ").slice(0, 300),
        attachments,
      });
      if (test.status !== "flaky") totalFailed += 1;
    }
  }

  write(`### ${label} — ${failures.length ? `${failures.length} problem test(s)` : "all green"}`);
  write();
  for (const failure of failures) {
    write(`- **${failure.status.toUpperCase()}** \`${failure.title}\`${failure.project ? ` _(${failure.project})_` : ""}${failure.retries ? ` — ${failure.retries} retry(ies)` : ""}`);
    if (failure.error) write(`  - ${failure.error}`);
    for (const attachment of failure.attachments) write(`  - ${attachment}`);
  }
  write();
}

if (!sawResults) {
  write(`### ${label}`);
  write();
  write("> No Playwright JSON results were produced (the run failed before tests started).");
  write();
}

if (totalFailed > 0) {
  write("<details><summary>How to inspect these failures</summary>");
  write();
  write("1. Download the **playwright-html-report** artifact from this run, unzip it and open `index.html`.");
  write("2. For a step-by-step timeline, download **playwright-traces** and run:");
  write("   ```bash");
  write("   bunx playwright show-trace path/to/trace.zip");
  write("   ```");
  write("   or drag the `trace.zip` onto https://trace.playwright.dev (nothing is uploaded — it runs locally).");
  write();
  write("</details>");
}

write(`_${totalPassed} passing, ${totalFailed} failing._`);

const output = lines.join("\n");
console.log(output);
if (summaryPath) appendFileSync(summaryPath, `${output}\n`);

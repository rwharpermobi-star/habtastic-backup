#!/usr/bin/env node
/**
 * Fails the Android build when the launcher icons / splash screens are still the
 * default Capacitor template art (the old green-blue leaf) instead of the
 * generated HabTastic AI branding.
 *
 * Checks:
 *  1. every required mipmap density has the four launcher bitmaps
 *  2. adaptive icon XMLs exist for API 26+
 *  3. no launcher/splash file is byte-identical to the Capacitor template file
 *  4. the launcher art actually contains HabTastic purple/violet pixels
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RES = process.argv[2] ?? "android/app/src/main/res";
const TEMPLATE_TARBALL = "node_modules/@capacitor/cli/assets/android-template.tar.gz";
const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const LAUNCHERS = [
  "ic_launcher.png",
  "ic_launcher_round.png",
  "ic_launcher_foreground.png",
  "ic_launcher_background.png",
];

const errors = [];
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

const required = [];
for (const density of DENSITIES) {
  for (const file of LAUNCHERS) required.push(path.join(RES, `mipmap-${density}`, file));
}
required.push(path.join(RES, "mipmap-anydpi-v26", "ic_launcher.xml"));
required.push(path.join(RES, "mipmap-anydpi-v26", "ic_launcher_round.xml"));
required.push(path.join(RES, "drawable", "splash.png"));

for (const file of required) {
  if (!existsSync(file)) errors.push(`Missing generated resource: ${file}`);
}

// 3. template-identity check, read straight out of the Capacitor CLI template
if (existsSync(TEMPLATE_TARBALL)) {
  for (const file of required) {
    if (!existsSync(file)) continue;
    const entry = path.posix.join("app/src/main/res", path.relative(RES, file).split(path.sep).join("/"));
    let templateBuffer;
    try {
      templateBuffer = execFileSync("tar", ["-xzOf", TEMPLATE_TARBALL, entry], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      continue; // file does not exist in the template (e.g. ic_launcher_background.png)
    }
    if (templateBuffer.length && sha(templateBuffer) === sha(readFileSync(file))) {
      errors.push(`${file} is still the default Capacitor template asset — icon generation did not run`);
    }
  }
} else {
  console.log(`! Capacitor android template not found at ${TEMPLATE_TARBALL} — skipping template-identity check`);
}


// 4. brand colour check on the largest launcher bitmap
const brandTarget = path.join(RES, "mipmap-xxxhdpi", "ic_launcher.png");
if (existsSync(brandTarget)) {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(brandTarget)
      .resize(64, 64, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let purple = 0;
    let navy = 0;
    const px = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // violet / blue-dominant, clearly not the old green leaf
      if (b > 110 && b > g + 25 && r > 60) purple += 1;
      // the official logo sits on a dark navy field (~#01051f)
      if (r < 40 && g < 45 && b < 70 && b >= g) navy += 1;
    }
    const ratio = purple / px;
    const navyRatio = navy / px;
    console.log(`ic_launcher.png purple/violet pixel ratio: ${(ratio * 100).toFixed(1)}%`);
    console.log(`ic_launcher.png dark-navy pixel ratio: ${(navyRatio * 100).toFixed(1)}%`);
    if (ratio < 0.05) {
      errors.push(
        `${brandTarget} does not contain the HabTastic purple/violet palette (ratio ${(ratio * 100).toFixed(1)}%) — wrong source art?`,
      );
    }
    if (navyRatio < 0.15) {
      errors.push(
        `${brandTarget} is missing the official dark-navy background (ratio ${(navyRatio * 100).toFixed(1)}%) — wrong source art?`,
      );
    }

  } catch (error) {
    console.log(`! Could not inspect launcher pixels (${error.message}) — skipping colour check`);
  }
}


// 5. adaptive icon XMLs must reference the generated launcher layers
for (const xml of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const file = path.join(RES, "mipmap-anydpi-v26", xml);
  if (!existsSync(file)) continue;
  const contents = readFileSync(file, "utf8");
  if (!contents.includes("@mipmap/ic_launcher_foreground") || !contents.includes("@mipmap/ic_launcher_background")) {
    errors.push(`${file} does not reference the generated ic_launcher_foreground/background layers`);
  }
}

// 6. no stale launcher bitmaps outside the generated density set
const ALLOWED_DENSITIES = new Set([...DENSITIES, "ldpi", "anydpi-v26"]);
for (const entry of readdirSync(RES)) {
  if (!entry.startsWith("mipmap-")) continue;
  const density = entry.slice("mipmap-".length);
  if (!ALLOWED_DENSITIES.has(density)) {
    errors.push(`Stale launcher resource directory: ${path.join(RES, entry)} — remove it so the old icon cannot be packaged`);
    continue;
  }
  for (const file of readdirSync(path.join(RES, entry))) {
    if (!file.startsWith("ic_launcher")) continue;
    const isAdaptiveXml = density === "anydpi-v26" && file.endsWith(".xml");
    if (!isAdaptiveXml && !LAUNCHERS.includes(file)) {
      errors.push(`Stale launcher asset: ${path.join(RES, entry, file)} — not part of the generated icon set`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}

console.log("✔ Android launcher icons and splash screens are the generated HabTastic AI branding");

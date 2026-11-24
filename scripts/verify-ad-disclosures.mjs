#!/usr/bin/env node
/**
 * CI guard: keeps the public policy pages honest about advertising.
 *
 * Validates both native AdMob and browser AdSense wiring against the public
 * disclosures and the publisher-authorization files used by Google.
 */
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const PRIVACY = 'src/pages/PrivacyPolicy.tsx';
const TERMS = 'src/pages/TermsOfService.tsx';
const ENV_PROD = '.env.production';
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const PKG = 'package.json';
const INDEX = 'index.html';
const ADS_TXT = 'public/ads.txt';
const APP_ADS_TXT = 'public/app-ads.txt';

const envProd = read(ENV_PROD);
const manifest = read(MANIFEST);
const pkg = read(PKG);
const index = read(INDEX);
const adsTxt = read(ADS_TXT);
const appAdsTxt = read(APP_ADS_TXT);

const envFlag = /^\s*VITE_ADMOB_LIVE\s*=\s*"?true"?/m.test(envProd);
const hasLiveUnitIds = /VITE_ADMOB_(BANNER|INTERSTITIAL|REWARDED)_ID\s*=\s*"?ca-app-pub-\d+\/\d+/.test(envProd);
const manifestAppId = /com\.google\.android\.gms\.ads\.APPLICATION_ID/.test(manifest)
  && /ca-app-pub-\d+~\d+/.test(manifest);
const pluginInstalled = /"@capacitor-community\/admob"/.test(pkg);
const adsenseClientMatch = envProd.match(/^\s*VITE_ADSENSE_CLIENT_ID\s*=\s*"?(ca-pub-(\d+))"?/m);
const adsenseClientId = adsenseClientMatch?.[1] ?? '';
const publisherId = adsenseClientMatch?.[2] ?? '';
const webAdsEnabled = !!adsenseClientId;
const nativeAdsEnabled = envFlag || hasLiveUnitIds || manifestAppId;
const adsEnabled = nativeAdsEnabled || webAdsEnabled;

const errors = [];
const warnings = [];

const CONTRADICTIONS = [
  /we\s+do\s+not\s+serve\s+ads/i,
  /we\s+don'?t\s+serve\s+ads/i,
  /no\s+ads\s+are\s+(shown|served|displayed)/i,
  /ad-?free\s+(for\s+)?(all|every)\s+users?/i,
  /we\s+do\s+not\s+(use|show|display)\s+(any\s+)?(third-?party\s+)?(advertis\w+|ads)/i,
];

const REQUIRED = [
  { label: 'Google AdMob named', re: /AdMob/i },
  { label: 'advertising identifier disclosed', re: /advertising\s+id(entifier)?|AAID|IDFA/i },
  { label: 'consent/privacy mechanism disclosed', re: /consent|User\s+Messaging\s+Platform|UMP|privacy/i },
  { label: 'Premium/no-ads carve-out stated', re: /premium/i },
];

for (const file of [PRIVACY, TERMS]) {
  const src = read(file);
  if (!src) {
    errors.push(`${file}: file not found`);
    continue;
  }

  for (const re of CONTRADICTIONS) {
    const match = src.match(re);
    if (!match) continue;
    if (adsEnabled) errors.push(`${file}: contradicts live ad config — found "${match[0].trim()}"`);
    else warnings.push(`${file}: contains "${match[0].trim()}" (ads currently disabled)`);
  }

  if (nativeAdsEnabled) {
    for (const { label, re } of REQUIRED) {
      if (!re.test(src)) errors.push(`${file}: missing required ad disclosure — ${label}`);
    }
  }
  if (webAdsEnabled && !/AdSense/i.test(src)) {
    errors.push(`${file}: web ads configured but Google AdSense is not disclosed`);
  }
}

if (nativeAdsEnabled && !pluginInstalled) {
  warnings.push('Ad config looks live but @capacitor-community/admob is not in package.json');
}

if (webAdsEnabled) {
  const expectedSeller = `google.com, pub-${publisherId}, DIRECT, f08c47fec0942fa0`;
  if (!adsTxt.includes(expectedSeller)) errors.push(`${ADS_TXT}: missing AdSense publisher authorization for pub-${publisherId}`);
  if (!appAdsTxt.includes(expectedSeller)) errors.push(`${APP_ADS_TXT}: missing AdMob publisher authorization for pub-${publisherId}`);
  if (!index.includes(`name="google-adsense-account" content="${adsenseClientId}"`)) {
    errors.push(`${INDEX}: missing google-adsense-account meta tag for ${adsenseClientId}`);
  }
  if (!index.includes('googlesyndication.com')) {
    errors.push(`${INDEX}: CSP does not allow Google ad-serving domains`);
  }
}

console.log(`Native AdMob configuration: ${nativeAdsEnabled ? 'LIVE' : 'disabled'}`);
console.log(`  VITE_ADMOB_LIVE=true: ${envFlag}`);
console.log(`  live ad unit IDs:     ${hasLiveUnitIds}`);
console.log(`  Android APPLICATION_ID: ${manifestAppId}`);
console.log(`  AdMob plugin installed: ${pluginInstalled}`);
console.log(`Web AdSense configuration: ${webAdsEnabled ? 'CONFIGURED' : 'disabled'}`);
console.log(`  AdSense client: ${adsenseClientId || '(none)'}`);
console.log(`  ads.txt present: ${existsSync(ADS_TXT)}`);
console.log(`  app-ads.txt present: ${existsSync(APP_ADS_TXT)}`);

for (const w of warnings) console.log(`WARN  ${w}`);

if (errors.length) {
  console.error('\nAd disclosure/configuration check FAILED:');
  for (const e of errors) console.error(`  ✖ ${e}`);
  console.error('\nUpdate the policy pages or ad configuration so they agree.');
  process.exit(1);
}

console.log('\n✔ Native/web ad configuration and policy disclosures agree.');

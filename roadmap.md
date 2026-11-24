# Google Play policy audit
- [x] Payments: Play Billing only on Android, Paystack only on web, shared status, no double subscription, correct manage/cancel link
- [x] Play purchases: server verify + acknowledge within 3 days, RTDN lifecycle, Restore purchases, paywall terms
- [x] Account deletion in app + public deletion page; privacy policy in app + public
- [x] AI: report/flag Winston responses, harmful-output filtering
- [x] Android: permissions + rationale, target API / 16 KB pages, no placeholders/dead links
- [x] Final report: already fine / fixed / owner to-dos

# Earlier (open)
- [x] Google Play service account permissions active in Play Console (owner; still "insufficient permissions" at 12:17 UTC)


## Owner actions left (Play audit)
- [ ] Play Console: Contains ads = Yes; declare Advertising ID use.
- [ ] Run `npx cap sync android` in the release build so voice/save/share plugins are bundled; check merged manifest.
- [ ] Check release AAB for 16 KB page-size alignment and test on a 16 KB emulator.

# Current
- [x] SEO: sitemap submitted to Search Console (habtastic.com domain property)
- [x] Verify Avatar Studio "take item off": every valid slot works when signed in; invalid slots and signed-out calls refused

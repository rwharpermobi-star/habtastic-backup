# Permanent Android CI versioning fix

## Changes
- Make Gradle read both `ANDROID_VERSION_CODE` and `ANDROID_VERSION_NAME`, validating the code as a positive integer; retain safe local fallbacks.
- Set both Android workflows to use `github.run_number` for the actual internal versionCode and `1.0.1` for versionName.
- After Capacitor sync, print the resolved Gradle version values so regeneration cannot silently reset them.
- After building, inspect the generated AAB with bundletool and the APK with Android build tools; fail CI if either internal versionCode differs from the run number or is not greater than 1.
- Preserve package ID, signing, Firebase, OAuth, billing, Paystack, and all app behavior.

## Validation
- Validate workflow YAML and Gradle configuration locally without publishing.
- The workflow itself remains the authoritative binary check because the signed Android artifacts are produced on the configured CI runner.

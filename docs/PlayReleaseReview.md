# Work to finish during closed testing

Package: `app.lovable.habtastic`. Upload the latest signed AAB to the existing
closed-testing track and install that release through its Google Play test link.
An APK installed directly is useful for diagnosis; it does not prove that the
Play-distributed build or its purchases work.

## Reviewer access

Before entering App access details in Play Console:

- Create and verify a dedicated review account using the normal signup flow.
- Give it access to all reviewable Premium features through an authorised,
  server-owned entitlement. Do not depend on the five-day trial remaining active.
- Open Journal and set a known four-digit passcode. Confirm it unlocks after
  signing out and signing back in on a clean installation.
- Confirm sign-in needs no expiring OTP, personal phone, location restriction
  or unavailable second factor.
- Put the real email, password and Journal passcode only in Play Console's
  App access fields. Never put credentials in this repository.

English instructions to adapt and enter in App access:

> Sign in with the review email and password supplied in the access fields.
> This account has access to Premium features without making a payment.
> Open Habits to add and complete a habit. Open Coach to send a typed message
> to Winston. Open Journal and enter the supplied four-digit journal passcode.
> Profile opens Subscription, notification settings, Security & Privacy,
> and Backup & Restore. Security & Privacy includes Export Data and Delete
> Account. The public deletion route is https://habtastic.com/delete-account.
> Optional microphone and notification permissions can be declined.

Do not submit the claim about Premium access until a fresh-device test proves it.
[Google's reviewer access requirements](https://support.google.com/googleplay/android-developer/answer/15748846).

## Phone and billing evidence

Record the installed version, date, device, result and any fix for each row.
Use a disposable account for account deletion; do not delete the reviewer account.

| Check | Required result |
| --- | --- |
| Fresh Play install and update | Opens without a missing-backend warning; existing user data survives an update. |
| Signup, sign-in, Google sign-in, password reset | Each flow completes and returns to the app. |
| Habits, Journal, Winston, backup | Changes persist after reopening; wrong Journal PIN cannot read or alter private entries. |
| Microphone and notifications | Grant and decline both permissions; typed chat still works; reminder arrives with the app closed. |
| Monthly and yearly Play plans | Both show the correct local price; purchase reaches Google and Premium activates server-side. |
| Restore and cancel | Profile → Subscription restores; management opens Google Play; cancel stops renewal and retains access until expiry. |
| Failed payment and expiry | No purchase acknowledgement or Premium grant on failure; expired access ends correctly. |
| Export and deletion | Export downloads; deletion removes access and private content; subscription cancellation is explained. |
| Ads and consent | Free users receive the intended ads; active Premium/trial users are ad-free; applicable consent choices work. |

Add the purchase account under Play Console **License testing** as well as the
closed-testing tester list. License testing provides test payment methods;
being a closed tester alone can still result in real charges. Confirm the test
payment method in the Google purchase dialog before proceeding.
[Google's billing test guide](https://developer.android.com/google/play/billing/test).

Play products: `habtastic_premium_monthly` / base plan `monthly` and
`habtastic_premium_yearly` / base plan `yearly`. Check both are active and
available in the tester's country. Verify an authenticated RTDN test notification,
then an actual purchase, renewal/cancellation and expiry notification. A test
notification without a purchase does not prove entitlement activation.

## Console and declaration checks

- Match screenshots and descriptions to the release testers actually install.
- Confirm App access, content rating, target audience, ads declaration, health
  declaration where applicable, Data safety and contact details are complete.
- Recheck Data safety against account data, habits/mood/journal/AI conversations,
  purchase history, AdMob identifiers and diagnostics. Review optional speech
  processing as well: microphone permission alone does not establish what leaves
  the device. Include the relevant service and SDK behaviour in the declaration.
- Confirm the live privacy and deletion URLs load without sign-in.
- Review Play's pre-launch report for crashes, startup, accessibility and layout.
- Keep tester feedback and the fixes made during the test for the production
  access application. Do not invent participation or feedback.

[Google's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

## Evidence boundary

On 3 October 2026, the live database had the Google-verified RTDN entitlement
trigger, provider-token uniqueness and owner-only subscription reads installed;
client subscription writes and direct entitlement-function execution were blocked.
There were no Google Play subscription rows. This confirms the configuration,
not a successful purchase. Phone results and the submitted Console forms must
be recorded before claiming production readiness.

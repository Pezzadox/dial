# Quick Dial: getting into the App Store and Google Play

Store ids: `com.pezzadox.quickdial` on both stores (`com.quickdial.app` is taken on Google Play).
Display name: Quick Dial. The Play Console app entry exists (created 22 November 2026).
Android builds run on GitHub (`quick-android.yml`) and are signed with an upload key whose
secrets live in GitHub, never in this repo. Expo's build service (EAS) remains the route for iOS.

## Release

Android, on GitHub (no Expo account needed): Actions → **Quick Dial Android** → Run workflow,
version e.g. `1.0.0`. It runs the checks, makes the native project with `expo prebuild`, and
builds and signs the bundle with Gradle. The signed bundle lands on the `play-bundles` branch for
Play Console. It needs these GitHub secrets: the four `QUICKDIAL_ANDROID_*` signing secrets
(`make-more-android-keys.ps1` sets them) and `QUICKDIAL_SUPABASE_ANON_KEY` (Supabase → Project
settings → API keys). Without them, and on every push that touches `app/`, it builds an unsigned
check bundle of the demo instead, so a broken build shows up straight away.

Both stores through Expo's build service (needs `EXPO_TOKEN`):

    git tag quick-v1.0.0 && git push origin quick-v1.0.0

## Before the first store submission

Done in the code:

- **Delete account inside the app** (You → Delete account), with `supabase/functions/delete-account`
  and migration `0010_account_deletion.sql`. Deploy that function and run that migration.
- **Paid plans hidden** until in-app purchases exist (`PURCHASES_LIVE` in `app/src/quick/api.ts`).
  The demo still shows them.
- **Report and block from any profile**, not only from chats (the ··· button).
- **A store build cannot ship the demo**: on Expo's build servers or in the GitHub Android build,
  a store build without the Supabase address and key stops with an error.
- **Privacy policy, terms and the account-deletion page** in `store/quick-dial/`, plus store
  listings, draft screenshots, and the Play icon and feature graphic
  (`store/quick-dial/android/graphics/`). The **Quick Dial pages** workflow publishes the three pages
  on GitHub Pages at https://pezzadox.github.io/dial/quick-dial/ (privacy.html, terms.html,
  delete-account.html). The contact email is filled in at publish time from the repository variable
  `QUICKDIAL_CONTACT_EMAIL`, so it is never committed. Have the privacy policy checked before launch.

Still needs your accounts:

1. **Live backend.** Create the Supabase project (UK/EU), run `supabase/migrations/` in order,
   deploy the edge functions (`delete-account`, `moderate-content`, `quick-push`, `suggest-replies`,
   `verify-start`, `verify-webhook`) with Actions → **Quick Dial backend** (needs the GitHub secret
   `SUPABASE_ACCESS_TOKEN`; it also runs on every push that changes a function), add the Database Webhooks (notifications → quick-push;
   media and quick_stories → moderate-content), set the `ANTHROPIC_API_KEY` secret, then set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables
   (production).

   **Live since 25 November 2026** (project `jbcdzsfgqqmwwrwublzo`, London): all six functions,
   first deployed from the dashboard while the access token was missing. The legacy JWT check is
   off for every function except moderate-content, because sessions are signed with the project's
   ECC key; each function checks its caller itself. Database Webhooks (integration installed):
   `moderate_media` (INSERT on media), `moderate_stories` (INSERT and UPDATE on quick_stories) →
   moderate-content, and `push_notifications` (INSERT on notifications) → quick-push, all with the
   service-role header the dashboard adds. Cron (integration installed): `quick-push-every-minute`
   calls quick-push with a secret key in the `apikey` header. Still missing: `ANTHROPIC_API_KEY`
   (without it photos and stories stay pending, so nobody is shown) and the Yoti secrets.
2. **Age check: Yoti** (Age Verification, https://hub.yoti.com). Open an account, then in Supabase →
   Edge Functions → Secrets set `VERIFY_PROVIDER` = `yoti`, `VERIFY_SDK_ID` and `VERIFY_API_KEY`
   from the Yoti Hub. Optional: `VERIFY_ESTIMATION_THRESHOLD` (default 25, the buffer for selfie age
   estimation; ID and the Yoti app check 18) and `VERIFY_API_URL` (default https://age.yoti.com).
   `verify-start` creates the session and `verify-webhook` re-reads each result from Yoti, so no
   webhook secret is needed. Members land on https://pezzadox.github.io/dial/quick-dial/verified.html
   afterwards.
3. **A review account** for Apple and Google: a verified test member with a complete profile,
   and a way for the reviewer to get its sign-in code.
4. **Real-photo screenshots.** The drafts use the demo's illustrated people; screenshots with
   real, consenting people will sell the app better.
5. **Push notifications.** Run `npx eas init` with `EXPO_PUBLIC_APP=quick`, then put the
   project id into `EAS_PROJECT_ID.quick` in `app/app.config.js`.

## One-time account setup

- Expo account (free) → access token → GitHub secret `EXPO_TOKEN`.
- Apple: in the Expo project, `eas credentials` → iOS → add the App Store Connect API key
  (the same key as World Mapper works). EAS creates the certificate and profile.
- Google: `eas credentials` → Android → upload the Play service-account JSON (the same as
  World Mapper works). The very first Android upload must be done by hand in Play Console.
- Google Play: new personal developer accounts must run a closed test with at least
  12 testers for 14 days before production. Start that early.

## Store questionnaires, for reference

Age rating 18+ / Mature (dating, user-generated content, user-to-user messaging,
shares location). Data collected: name, date of birth, photos and videos, rough location,
messages, device push token. Linked to the user, not used for tracking, no ads.

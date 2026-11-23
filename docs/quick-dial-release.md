# Quick Dial: getting into the App Store and Google Play

Store ids: `com.pezzadox.quickdial` on both stores (`com.quickdial.app` is taken on Google Play).
Display name: Quick Dial. The Play Console app entry exists (created 22 November 2026).
Builds go through Expo's build service (EAS), which also signs them, so there are no
keystores or certificates to keep in this repo.

## Release

    git tag quick-v1.0.0 && git push origin quick-v1.0.0

## Before the first store submission

Done in the code:

- **Delete account inside the app** (You → Delete account), with `supabase/functions/delete-account`
  and migration `0010_account_deletion.sql`. Deploy that function and run that migration.
- **Paid plans hidden** until in-app purchases exist (`PURCHASES_LIVE` in `app/src/quick/api.ts`).
  The demo still shows them.
- **Report and block from any profile**, not only from chats (the ··· button).
- **A store build cannot ship the demo**: on Expo's build servers, a production build without the
  Supabase address and key stops with an error.
- **Privacy policy, terms and the account-deletion page** in `store/quick-dial/`, plus store
  listings, draft screenshots, and the Play icon and feature graphic
  (`store/quick-dial/android/graphics/`). Fill in the [BRACKETED] details, then put the three pages on a
  public web address (the website works). Have the privacy policy checked before launch.

Still needs your accounts:

1. **Live backend.** Create the Supabase project (UK/EU), run `supabase/migrations/` in order,
   deploy the edge functions (`delete-account`, `moderate-content`, `quick-push`, `suggest-replies`,
   `verify-start`, `verify-webhook`), add the Database Webhooks (notifications → quick-push;
   media and quick_stories → moderate-content), set the `ANTHROPIC_API_KEY` secret, then set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables
   (production).
2. **Selfie and age check provider** (e.g. Yoti, Veriff, Ondato): an account and API key, then
   finish `startSession()` in `verify-start` for that provider.
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

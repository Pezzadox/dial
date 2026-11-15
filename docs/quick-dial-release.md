# Quick Dial: getting into the App Store and Google Play

Store ids: `com.quickdial.app` on both stores. Display name: Quick Dial.
Builds go through Expo's build service (EAS), which also signs them, so there are no
keystores or certificates to keep in this repo.

## Release

    git tag quick-v1.0.0 && git push origin quick-v1.0.0

## Must be done before the first store submission

These are review blockers, not nice-to-haves. Apple and Google both reject dating apps that miss them.

1. **Live backend.** The app falls back to demo mode (invented people, "the demo pretends
   you're in Leeds") when no Supabase keys are set. A store build in demo mode will be rejected.
   Create the Supabase project (UK/EU), run `supabase/migrations/` in order, deploy the edge
   functions, add the notifications webhook, then set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables (production).
2. **Delete account inside the app.** Apple (guideline 5.1.1(v)) and Google Play both require
   anyone who can create an account to be able to delete it from within the app, and Google
   also needs a web page for deletion requests. Not built yet.
3. **Selfie and age check provider.** `verify-start` / `verify-webhook` need a real provider
   connected. Dating apps must be 18+ and the stores expect the age check to be real.
4. **Photo and video moderation.** New media stays "in review" until a moderation provider is
   connected (or staff approve it). Apps with user content need working moderation, plus the
   report and block that already exist.
5. **Paid tiers.** Quick+ shows "£5.99 a month" but purchases are not built
   ("Coming soon"). Either hide prices for the first release or add in-app purchases
   (Apple requires its own purchase system for digital upgrades). Showing a price that
   cannot be bought gets rejected as incomplete.
6. **Privacy policy and terms** at a public web address, covering photos, videos, selfie
   checks, rough location, messages, AI reply suggestions (sent to Anthropic only when used),
   and push notifications.
7. **Push notifications.** Run `npx eas init` with `EXPO_PUBLIC_APP=quick`, then put the
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

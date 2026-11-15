# Dial

The Dial dating app (formerly working title Prologue). See the Phase 1 product concept for the full design.

## What is here

| Path | What it is |
| --- | --- |
| `supabase/migrations/0001_core.sql` | Database: profiles, media, power-gauge ratings, likes, matches with 8 open slots, messages, conversation levels, date plans, confirmations and private feedback, the Ink ledger, reports, blocks, row-level security and the server functions that decide every award |
| `supabase/migrations/0002_engagement.sql` | Likes inbox and passes, like comments that open the chat, the personality game's results, server-checked daily and weekly challenges, the opt-in weekly board, moderation status set on upload |
| `supabase/migrations/0004_types.sql` | Declared looks, the private ideal partner, top three types, type training (up to 100 private yes/no answers), and introductions that carry how well you fit someone's ideal |
| `supabase/migrations/0006_dial_matching.sql` | The Dial is the only action: dialling a person 70+ both ways makes a match, notes open the chat, lower scores stay private, your type is learned from your Dials. Removes the separate training deck |
| `supabase/migrations/0007_games.sql` | Games for two (Build a date, This or that): picks stay hidden until both have chosen; a finished game counts towards Level 4. Also the AI suggestion log and daily cap |
| `supabase/functions/suggest-replies/` | Edge function for reply ideas (four tones). Uses the other person's messages only if they switched that on. Needs the secret `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`): `supabase secrets set ANTHROPIC_API_KEY=...` then `supabase functions deploy suggest-replies` |
| `supabase/migrations/0008_safety.sql` | Report and block (a report blocks too unless unticked; blocking ends the chat at once; reporters stay anonymous), suspensions that hide a member from everyone, "About you" editing, and the staff-only moderation console (reports, media review, an audit log). Add staff with `insert into public.staff values ('<member id>')` |
| `supabase/migrations/0009_quick_dial.sql` | Quick Dial: decks of ten, five Dials per person, scores (average of the five), connections anyone can message, mutuals at 70+ both ways, the notification queue and push tokens |
| `supabase/migrations/0010_account_deletion.sql` | Deleting your account: staff and moderation history survive a staff member leaving, and a staff-only record of reports about a deleted member is kept for 12 months |
| `supabase/functions/delete-account/` | Deletes the signed-in member's files and account (everything cascades). Deploy with `supabase functions deploy delete-account` |
| `supabase/functions/quick-push/` | Sends queued notifications to phones through Expo's push service. Deploy it, then add a Database Webhook on INSERT into `public.notifications` that calls it with the service role key |
| `supabase/migrations/0005_dial_training.sql` | Type training scores each person with the Dial (1 to 100) instead of a yes/no swipe |
| `supabase/migrations/0003_storage.sql` | Private `media` bucket: members write only their own folder, others read only through signed URLs |
| `app/` | Expo (React Native) app for iOS, Android and web |
| `app/src/core/` | Shared rules: Chapters, conversation levels, compatibility, Standing, gauge maths |
| `app/src/components/PowerGauge.tsx` | The Dial: hold a photo or video and turn your finger around it to set 0 to 100 |
| `app/src/theme.ts` | Brand identity: dark glow (default) and light palettes, the Dial gradient, the italic serif, theme switching |
| `app/src/components/Ambient.tsx` | The ambient glow drifting behind every screen |
| `app/src/components/DialCircle.tsx`, `DialStage.tsx` | Photos as circles; hold or tap opens the photo full screen with the ring Dial in the middle |
| `app/src/screens/Intro.tsx`, `app/src/components/Logo.tsx` | The "Together" mark (two arcs that meet and grow into a d), the animated logo and slogan on every launch, and the first-time walkthrough ending in a practice Dial |
| `app/src/sound.ts`, `app/assets/sounds/` | The sound set and its on/off setting. Regenerate the sounds with `python3 scripts/make-sounds.py` |
| `app/src/api/supabase.ts` | Production data source (calls the database functions) |
| `app/src/api/demo.ts` | In-memory data source with invented people, used when no backend is configured |
| `app/tests/` | Database rule checks (run on an embedded Postgres) and unit tests |

## Run it

```bash
cd app
npm install
npm test            # 43 unit tests for the shared rules
npm run test:db     # 22 checks of the database rules and security
npm run typecheck
npx expo start      # demo mode; press w for web, or scan the code with Expo Go
```

## Connect the real backend

1. Create a Supabase project in a UK or EU region.
2. Run the six files in `supabase/migrations/` in order in the SQL editor (or `supabase db push`). The third creates the private `media` bucket.
3. Until a moderation provider is connected, new photos and videos stay in review. For a closed alpha you can set `auto_approve_media` to 1 in the `economy` table, or approve items with `app.moderate_media`.
4. Enable email sign-in with one-time codes under Authentication.
5. Copy `app/.env.example` to `app/.env` and fill in the project URL and anon key.
6. `npx expo start`. The app now signs in by email code and uses the database.

The Supabase data source has been type-checked and the SQL it calls is tested, but it has
not yet been run against a live Supabase project.

## How the Dial feeds scoring

- One rating per person per photo or video; rating again overwrites.
- You cannot rate your own media, unapproved media, or anyone you have blocked.
- The owner sees an average per item only after 5 different raters, and never who rated.
- `app.presentation_score(member)` is the mean of those item averages. It is the
  Presentation component of Standing (weight 10 of 100, set in `app/src/core/standing.ts`).
- Ratings pay no Ink, so there is nothing to farm.

## Matching columns

Discover can sort by four columns. Rules are in `app/src/core/looks.ts` and `compatibility.ts`.

| Column | What it measures |
| --- | --- |
| Looks | Best fit to your top three types (your #2 counts 90%, #3 80%), blended 70/30 with what your profile Dials taught it (your average Dial per hair colour, eye colour, build and hair length). Only declared attributes; undeclared counts as neutral |
| Personality | Your personality against theirs: similar humour and openness, complementary talker/listener and planner/improviser |
| Ideal | Their personality against your ideal partner, nudged by the vibe of the type they fit, averaged with how well you fit their ideal |
| Overall | Personality 40, Ideal 35, Looks 25. Looks never outweigh the other two |

## Not built yet

Logic, creativity and humour games; a See-who-likes-you paywall and subscriptions; recognitions after
dates; seasons and the other leaderboards; the admin console; age-assurance and moderation providers;
push notifications; photo reordering and captions. Video files upload and play, but there is no
in-app recorder yet: members pick a video they already have.


## Quick Dial

Quick Dial is a second, streamlined app in the same codebase, on the same backend (members, photos, blocks and moderation are shared).

- Run it: `EXPO_PUBLIC_APP=quick npx expo start`. Without the variable you get Dial.
- **The set you dial:** 5 photos (looks), 1 talking video (vibe), 5 short stories of up to 140 characters (personality). A person's score from you is weighted 40% looks, 20% vibe, 40% personality (`quick_w_*` in `economy`).
- **Flow:** splash, three intro cards, setup in five steps (you and distance, photobooth, photos + video, stories, selfie check), then rounds. Each round shows ten verified people; flick through all of them, choose one, dial their 11 (each starts at 0; tap a score to change it; Submit sends them).
- **Photobooth:** setup includes three quick front-camera selfies (3-2-1, flash). They rotate in that person's circle on the deck, so the ten circles feel alive. Stored in `quick_booth`, checked like photos, not dialled. Reduced-motion settings stop the rotation.
- **Distance:** setup asks for rough location (rounded to ~1 km by `set_location`) and a range (5 to 100 miles, `set_max_distance`). Decks only include people within both people's range, nearer first, and show whole miles, never below 1.
- **Daily rounds:** 5 a day free (50 to browse), 10 on Quick+ (£5.99 a month, 100 to browse), unlimited on Gold (£14.99 a month), resetting at midnight UK time. Extra rounds can be bought one at a time.
- **Messaging:** everyone you dial gets a connection. Until you're dialled in it's one message until the other person replies. Chats show "Your turn".
- **Mutuals and the 8pm drop:** both dialling each other "high" is a mutual. High means 70+, or the top 30% of your own Dials once you've given 3 (never below 55), so selective diallers aren't locked out (`app.is_high`). The person dialling at that moment hears at once; the other hears in the 8pm drop (`notifications.deliver_at`). Run `quick-push` on a one-minute cron.
- **Edit profile (You › Edit profile):** retake photobooth selfies, replace photos, re-record the video, rewrite or swap story prompts, change distance. Your best and lowest-scoring photo or story are marked so you know what to change. Changes are re-checked before anyone sees them.
- **Fair decks:** up to 3 people who dialled you high come first (marked ✦ for Quick+ and Gold; free members see "someone in this ten dialled you high"), then Gold spotlight, then the people who've been dialled least, nearer first, with a shuffle. Plan perks are open to everyone until plans go live.
- **Simulation:** `simulation/quick_dial_sim.py` plays 2,000 members over two weeks. Before these rules 19% had a mutual and 13% were never dialled; after, 59% (67% with some paid members) and 0.2%. Re-run it when changing thresholds, daily limits or deck rules.
- **Your Dial:** your average over time, by looks, vibe and personality, with a weekly trend and a tip. Shown only after 5 people have dialled you, so no single score can be worked out.
- **Their Dial:** someone else's averages, only if they allow it (on by default, switch in You), only after 10 people, and only for Quick+ once plans are live. Never individual scores.
- **Verification:** everyone shown in decks has passed a selfie liveness, face match and age check (`quick_require_verified`). `verify-start` opens the provider; `verify-webhook` (HMAC-signed) records the result. Set `VERIFY_PROVIDER`, `VERIFY_API_URL`, `VERIFY_API_KEY`, `VERIFY_WEBHOOK_SECRET`, and map the provider's payload in those two functions. A failed age check pauses the account and raises a priority report.
- **AI checks:** `moderate-content` reviews every photo and story with Claude before it goes live (approve, reject, or send to the moderation console). Videos always go to a person. Hook it to Database Webhooks on `media` and `quick_stories`. Needs `ANTHROPIC_API_KEY`.
- **Plans:** Quick (free), Quick+ and Quick Gold are built (`subscriptions`, `app.quick_tier`) but switched off: until `economy.quick_plans_live = 1` everyone is free. Payments still need App Store / Play billing (for example via RevenueCat) writing to `subscriptions`. Prices in `src/quick/core.ts` are placeholders. "See who dialled you high" and Gold's "undo" are listed perks still to build.
- Code: `QuickApp.tsx` and `src/quick/`. Rules in `src/quick/core.ts` (tests in `tests/quick.test.ts`) and migration 0009.

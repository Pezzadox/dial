# Working on Dial and Quick Dial

- After every change: run the checks below, then commit and push to `main` on GitHub (Pezzadox/dial). The owner asked for this to happen automatically.
- Checks (from `app/`): `npx tsc --noEmit`, `npx vitest run`, `node tests/db-rules.mjs`.
- Web previews: `EXPO_PUBLIC_APP=quick` builds Quick Dial, otherwise Dial; then `node scripts/build-preview.mjs` (set `PREVIEW_DIR=preview-quick` for Quick Dial). Previews are build output and are not committed.
- Never commit secrets (`.env`, API keys, service-role keys) or personal email addresses.
- Copy is British English. Scores someone receives are never shown individually to anyone.

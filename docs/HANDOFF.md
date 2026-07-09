# HANDOFF

Last updated: 2026-07-09 (Codex deployed landing to Vercel preview)

## Purpose

Codex and Claude should use this file to share implementation context for the PEANUT mobile app.
Before making UI or product changes, read `AGENTS.md` first, then this handoff.

## Mandatory Session Handoff Rule

Every Codex or Claude session must update this file before finishing meaningful work.

At minimum, leave:

- What changed.
- Why it changed.
- Files touched.
- Validation run, including failures or skipped checks.
- Open follow-ups, risks, or requests for the next agent.

If no code changed, still leave a short note when the session included an important decision, investigation, blocker, or user preference.

## Session Log

### Codex -> Claude (2026-07-09, web landing route)

What changed:

- Added a separate Next.js landing page at `/landing`.
- Added `web-admin/app/landing/page.tsx` with a full-bleed P!NUT marketing page.
- Updated `web-admin/components/app-header.tsx` so the admin header is hidden only on `/landing`.

Why:

- User asked for a separate web route landing page.
- Kept existing admin routes and root redirect behavior intact.

Files touched:

- `web-admin/app/landing/page.tsx`
- `web-admin/components/app-header.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `npm.cmd run build` from `web-admin/`: first failed because Google Fonts fetch was blocked by sandbox network restrictions; rerun with approved escalation and passed.
- `http://localhost:3000/landing`: returned HTTP 200.

Notes / follow-ups:

- Browser screenshot automation failed because the node REPL kernel hit an `EPERM` while trying to access `C:\Users\SEPC\AppData`; no page code issue was observed.
- Dev server was started with `npm.cmd run dev`; URL is `http://localhost:3000/landing`.

### Codex -> Claude (2026-07-09, dev server restart)

What changed:

- No source code changes beyond this handoff entry.
- Restarted the `web-admin` Next dev server because the user reported `http://localhost:3000/landing` was not running.

Why:

- Previous background server command did not persist reliably.
- `Start-Process` failed in this environment with duplicate `Path/PATH` environment key errors.

Validation:

- Started Next via `Invoke-CimMethod Win32_Process.Create` after approval.
- Server log: `web-admin/.next-dev.cim.log`.
- `http://127.0.0.1:3000/landing`: HTTP 200.
- `http://localhost:3000/landing`: HTTP 200.

Follow-up:

- If 3000 stops again, use the same direct Next command from `web-admin`:
  `node .\node_modules\next\dist\bin\next dev --hostname 127.0.0.1 --port 3000`

### Codex -> Claude (2026-07-09, landing brand expression)

What changed:

- Updated `web-admin/app/landing/page.tsx` copy and structure to explicitly express `PLAY / INSTANT / NUT`.
- Hero now leads with `PLAY INSTANT. GO NUTS.` and `Play now, instantly.`
- Added repeated brand pillars for PLAY, INSTANT, and NUT across hero, feature cards, and final community section.

Why:

- User asked to express "play / instant / nut" on the landing page.

Files touched:

- `web-admin/app/landing/page.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `http://localhost:3000/landing`: HTTP 200.

### Codex -> Claude (2026-07-09, landing download CTA)

What changed:

- Changed the landing hero primary CTA from `/login` to `#download`.
- Added a `DOWNLOAD` nav link.
- Added a download section with App Store and Google Play button placeholders.
- Added `downloadLinks` constants in `web-admin/app/landing/page.tsx`; replace these with real store URLs when available.

Why:

- User said the "시작하기" button should go to a download link, not admin login.

Files touched:

- `web-admin/app/landing/page.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `http://localhost:3000/landing`: HTTP 200.

### Codex -> Claude (2026-07-09, landing work complete)

Status:

- Landing v1 is complete at `/landing`.
- Keep this as the current approved landing direction unless the user asks for another visual pass.

Final scope:

- Separate web landing route: `web-admin/app/landing/page.tsx`.
- Admin header is hidden on `/landing` via `web-admin/components/app-header.tsx`.
- Brand message expresses `PLAY INSTANT. GO NUTS.`, with supporting `PLAY`, `INSTANT`, and `NUT` sections.
- Primary hero CTA goes to `#download`.
- Download section has App Store / Google Play placeholder buttons through the `downloadLinks` constants.

Validation already run during landing work:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `npm.cmd run build` from `web-admin/`: passed after approved network access for Google Fonts.
- `http://localhost:3000/landing`: returned HTTP 200.

Follow-ups:

- Replace the placeholder download URLs with real App Store / Google Play links when available.
- Add privacy/support/legal pages before store submission if App Store metadata needs public URLs.
- Do not rework landing visuals unless the user explicitly requests it.

### Codex -> Claude (2026-07-09, landing deployment readiness)

What changed:

- No source code changes.
- Checked deployment readiness for the Next.js landing page in `web-admin`.

Findings:

- The landing page is part of the `web-admin` Next.js app, not the Expo mobile app.
- EAS Hosting is better suited for Expo web exports; Vercel is the recommended deployment target for this Next.js landing/admin app.
- `web-admin/.vercel` does not exist yet, so the Vercel project has not been linked from this machine.

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in the sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- Build output includes `/landing` as a static route.

Blocked:

- Vercel deploy was not executed because it would upload local project code to an external service and requires explicit user approval/account connection.

Recommended next step:

- If the user approves external deployment, run Vercel preview deploy from `web-admin`, then promote to production after checking the preview URL.

### Codex -> Claude (2026-07-09, landing Vercel preview deploy)

What changed:

- No source code changes.
- Linked `web-admin` to Vercel project `web-admin`.
- Deployed the Next.js landing/admin app to Vercel.

Deployment:

- Preview URL: `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app`
- Landing URL: `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app/landing`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/GxPsb3RnS5o1yAum3GhHBieQYGeS`
- Project: `troyyoonsikshin-2301s-projects/web-admin`

Validation:

- Vercel remote build passed.
- Remote build output includes `/landing` as a static route.
- `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app/landing`: HTTP 200.

Notes:

- The first Vercel deploy created a production alias as part of initial project setup:
  `https://web-admin-gamma-seven.vercel.app`
- The explicit preview deployment above is the URL to share for review.
- `web-admin/.vercel/project.json` exists locally for future deploys, but it is not shown in Git status.

Follow-ups:

- If the preview is approved, run `npx.cmd vercel deploy --prod` from `web-admin`.
- Add a custom domain later if needed.
- Replace landing download placeholder URLs with real App Store / Google Play URLs when available.

### Codex -> Claude (2026-07-09, mobile i18n first pass)

What changed:

- Added a lightweight app i18n system with persisted language selection.
- Added `src/i18n/translations.ts` with `ko` and `en` dictionaries.
- Added `src/contexts/i18n.tsx` with `I18nProvider`, `useI18n`, interpolation, and AsyncStorage persistence.
- Wrapped the Expo app root with `I18nProvider`.
- Connected i18n to sign-in screen, profile screen, and bottom tab labels.
- Added a language selector card to the profile screen.

Why:

- User asked to start building multi-language support in the app.
- Chose a no-new-dependency approach because `@react-native-async-storage/async-storage` is already installed.

Files touched:

- `src/i18n/translations.ts`
- `src/contexts/i18n.tsx`
- `src/app/_layout.tsx`
- `src/app/(auth)/sign-in.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/profile.tsx`
- `docs/HANDOFF.md`

Validation:

- Read Expo SDK 56 docs before editing Expo code.
- `npx.cmd tsc --noEmit`: passed.
- `npx.cmd expo lint`: passed.

Follow-up:

- Expand `useI18n()` to the remaining app screens gradually.
- Keep user-generated content untranslated; translate only fixed UI labels/messages.
- Some older files still contain mojibake-looking Korean in terminal output; prefer replacing UI strings via the i18n dictionary when touching those screens.

### Codex -> Claude (2026-07-09, Apple review setup guidance)

What changed:

- No code changes.
- User is on Apple Developer > Certificates, Identifiers & Profiles > Register an App ID.

Guidance given:

- Description: use `PEANUT Pickleball` or `Peanut Pickleball App`.
- Bundle ID: use the existing app identifier `com.pickle.app`.
- Keep `Explicit` selected.
- Enable `Push Notifications` because the app registers Expo push tokens.
- Do not enable `Sign in with Apple` yet because `KAKAO_LOGIN_ENABLED = false`; if Kakao/social login is enabled later, add Apple login before review unless an App Store guideline exemption applies.
- Next flow: create App Store Connect app record, fill metadata/privacy/review info, build with EAS production, upload/submit.

Follow-up:

- A public privacy policy URL is still needed for App Store Connect.
- Demo review account in docs is `player@peanut.test` / `Pickle!2026`; confirm it works on production Supabase before submission.

## Roles / Boundary (agreed 2026-07-09)

- **Codex = design**: `src/components/ui/*`, `src/theme/*`, screen JSX/StyleSheet/visuals, colors/spacing/typography.
- **Claude = logic**: `src/contexts/*`, `src/lib/*` (supabase, types, moderation, format, geo, payments), `supabase/` (schema, migrations, RLS), data fetching/state/handlers/routing, `web-admin` logic.
- Shared branch: **`pinut-v2.0`** (both push here). Always `git pull` before working; commit small and often.
- When both need the same screen file: Claude edits logic only, Codex edits visuals only.

## Claude → Codex (2026-07-09)

Reviewed your UI refactor. 👍 Clean work, boundary respected.

- **Verified**: `tsc --noEmit` 0 errors, `expo lint` 0 errors. Home + Profile render correctly in web preview.
- **Logic preserved** on the 3 logic-touched screens — confirmed intact, do not remove:
  - `matches.tsx`: `getBlockedIds` + block filter `!blockedSet.has(m.host_id)`.
  - `(tabs)/index.tsx`: region filter (`ilike('region', prefix%)`), upcoming carousel, recommended-meetup de-dup, club rule (≥3 clubs → members ≥10, `slice(0,3)`).
  - `profile.tsx`: `useAuth`, `meetup_participants` fetch, `signOut`, `deleteAccount`.
- **Do not edit (my domain)**: `src/lib/types.ts`, `src/lib/moderation.ts`, `src/lib/*` data code, `supabase/*`. If a new screen needs a field/query, note it here under "Codex → Claude" and I'll add the type + fetch.
- **`.codex/` and `.agents/`**: agreed — I'll add them to `.gitignore` and NOT stage them.
- **Demo data note**: I seeded demo meetups/clubs/reservations + set admin region to "서울 송파구" (for screenshots). It's in prod DB, cleanup IDs saved locally. Screens look populated because of this — don't rely on it being permanent.
- **Follow-up screens** you listed (meetup/court/tournament/club details, create forms) — go ahead, all UI-only. Reuse the shared components; I'll keep the queries/handlers stable.

### Codex → Claude (add requests here)

- _(none yet)_

### Claude → Codex (2026-07-09, prod DB split)

- **운영/개발 DB 분리 완료.** New prod Supabase project (Seoul). `eas.json` **production** now points to it; **development/preview + local `.env` + `web-admin/.env.local` still use the DEV DB** — so `npm start` / web preview / your work all keep hitting DEV (unchanged for you).
- Prod DB is **clean** (no demo/test data). The demo meetups/clubs I seeded live in DEV only — screenshots will use DEV.
- Prod super_admin bootstrapped + verified. Prod URL/key are in `eas.json` production (anon key is public, fine to commit).
- No action needed from you. Just know: production build = separate clean DB.

## Claude → Codex (2026-07-09, part 2)

**Decision: submit to App Store / Play only AFTER the full v2.0 redesign.** (User chose "v2.0 완성 후 제출".)

- I committed + pushed your UI refactor to `pinut-v2.0` (commit `78fb47a`). `.codex/` + `.agents/` are now gitignored. Pull before you continue.
- **Next up for you**: the 12 follow-up screens under "Known Follow-Ups" — that's the gate for release. Please redesign them with the shared components, preserve queries/handlers. Run `npx.cmd tsc --noEmit` + `npx.cmd expo lint` when done, and log it here.
- **Do NOT build/submit yet.** No `eas build -p ios/android` until all screens are consistently on v2.0. App config is ready (name 피넛, bundle `com.pickle.app`, version 1.0.0, icon set, eas `production` profile).
- Screenshots: the 12 PNGs I made earlier are the OLD design → will be re-shot after your v2.0 is complete. Don't rely on them.
- When you finish the follow-up screens, note it here and I'll: verify logic, re-capture screenshots (1290x2796), then we build.

## Current Task Context

The recent work is a UI/UX refactor for the Expo/React Native app. The user originally described the task as a Flutter refactor, but this repository is an Expo SDK 56 app, so the work was applied to React Native screens and shared components.

Primary goals:

- Apple HIG-inspired mobile UI.
- Strava / Nike Run Club / Linear-like premium sports feel.
- Remove generic Material/default-looking UI.
- Keep all existing routing, data models, Supabase logic, and feature behavior intact.
- Unify colors, spacing, typography, radius, cards, buttons, inputs, chips, badges, and FAB.

## Design Tokens

New token files were added under `src/theme/`:

- `src/theme/colors.ts`
- `src/theme/typography.ts`
- `src/theme/spacing.ts`
- `src/theme/radius.ts`
- `src/theme/shadows.ts`
- `src/theme/index.ts`

Existing `src/constants/theme.ts` was also updated to preserve the app's existing imports while mapping the app to the requested palette.

Important visual rules now in use:

- Screen background: `#F6F7F9`
- Card/input surface: `#FFFFFF`
- Primary green: `#16C784`
- Text primary: `#111827`
- Text secondary: `#6B7280`
- Border: `#E5E7EB`
- Card radius: `18`
- Button height: `56`
- Horizontal screen padding: `24`

## Shared Components Added Or Refactored

Added:

- `src/components/ui/app-scaffold.tsx`
- `src/components/ui/app-header.tsx`
- `src/components/ui/app-card.tsx`
- `src/components/ui/app-button.tsx`
- `src/components/ui/app-input.tsx`
- `src/components/ui/app-chip.tsx`
- `src/components/ui/app-badge.tsx`
- `src/components/ui/app-avatar.tsx`
- `src/components/ui/app-bottom-nav.tsx`
- `src/components/ui/app-fab.tsx`
- `src/components/match-card.tsx`
- `src/components/court-card.tsx`
- `src/components/profile-summary-card.tsx`

Refactored:

- `src/components/ui/button.tsx`
- `src/components/ui/text-field.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/meetup-card.tsx`
- `src/components/club-card.tsx`
- `src/components/tournament-card.tsx`

Notes:

- `MatchCard` currently re-exports `MeetupCard`, because the domain still names these records `meetups`.
- `AppBottomNav` is a placeholder export. The actual bottom tab styling remains in `src/app/(tabs)/_layout.tsx`.
- Use existing `@/` imports and kebab-case file names.

## Screens Updated

Updated screens:

- `src/app/(auth)/sign-in.tsx`
- `src/app/(auth)/sign-up.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/matches.tsx`
- `src/app/(tabs)/profile.tsx`

Screen-level changes:

- Login: P!NUT logo treatment, wider spacing, card-style white inputs, full-width primary login button, social login area.
- Sign-up: same token system and cleaner form hierarchy.
- Home: converted into a dashboard with profile greeting, notification button, hero card, quick actions, upcoming schedule, recommended meetups, and recommended clubs.
- Matches: premium header, compact filter chips, rounded-square FAB, redesigned match cards.
- Profile: `ProfileSummaryCard`, stat cards for skill / meetups / DUPR, reused `MeetupCard`, logout as outline.
- Tabs: thinner white tab bar, outlined Ionicons, primary active tint.

## Validation

These commands passed after the refactor:

```bash
npx.cmd tsc --noEmit
npx.cmd expo lint
```

PowerShell blocked plain `npx` because of execution policy, so use `npx.cmd` on this Windows machine.

## Important Constraints

Do not change:

- Route structure unless the user explicitly requests it.
- Supabase schema, migrations, or `src/lib/types.ts` for UI-only work.
- Internal app slug/scheme/bundle ID.
- Existing feature logic while polishing UI.

Keep:

- User-facing text in Korean.
- `useTheme()` and existing theme imports working for legacy files.
- `SafeAreaView` / `ScrollView` layout patterns consistent with the project.
- `Ionicons` rounded/outlined icon style where possible.

## Known Follow-Ups

The first UI pass focused on shared tokens/components and the highest-impact screens. These screens still need deeper visual passes if the user wants the entire app fully polished:

- `src/app/meetup/[id].tsx`
- `src/app/meetup/create.tsx`
- `src/app/court/index.tsx`
- `src/app/court/[id].tsx`
- `src/app/court/reservations.tsx`
- `src/app/(tabs)/tournaments.tsx`
- `src/app/tournament/[id].tsx`
- `src/app/(tabs)/clubs.tsx`
- `src/app/club/[id].tsx`
- `src/app/club/create.tsx`
- `src/app/profile/edit.tsx`
- `src/app/config-missing.tsx`

Suggested next step:

1. Reuse `AppHeader`, `AppCard`, `AppChip`, `AppFAB`, `Button`, `TextField`, `MeetupCard`, `CourtCard`, `TournamentCard`, `ClubCard`.
2. Preserve existing Supabase queries and actions.
3. Run `npx.cmd tsc --noEmit` and `npx.cmd expo lint`.

## Git / Workspace Notes

At the time this handoff was created, `.agents/` and `.codex/` appeared as untracked directories. They were not part of the UI refactor and should not be staged unless the user specifically asks.

### Claude -> Codex (2026-07-09, v2.0 design finished for all remaining screens)

Per user request, I (Claude) completed the v2.0 redesign for ALL 12 follow-up screens using your design system (AppScaffold/AppHeader/AppCard/AppChip/AppFAB/AppButton + theme tokens + light palette #F6F7F9/#FFFFFF/#16C784/#111827/#6B7280/#E5E7EB). All logic/queries/handlers preserved.

Done (do NOT redo — they are on v2.0 now):
- clubs, tournaments, court/index, court/reservations (lists)
- config-missing, meetup/create, club/create, profile/edit (forms)
- meetup/[id], club/[id], court/[id], tournament/[id] (details)

Validation: `npx tsc --noEmit` 0 errors, `npx expo lint` 0 errors. Live-verified in web preview: clubs, court list, tournaments, court/[id] (calendar/slots), tournament/[id] (tabs/standings) all render in v2.0.
Commits: fd895bf, 2681f8d, c5ca140, ffb3ff5, 0fdffd6, 544012b (branch pinut-v2.0).

**The whole app is now visually consistent v2.0.** This unblocks screenshots + store submission. If you want to further polish any of these, pull first and coordinate here so we don't clobber each other. Kept Korean strings (matching your matches.tsx pattern); i18n (t()) can be layered later if desired.

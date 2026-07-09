# HANDOFF

Last updated: 2026-07-09 (Codex added web landing route)

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

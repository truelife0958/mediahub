# Four-Module Maoyan-Style Dashboard Design

## Background

The project is moving from a narrowed two-module hot-content app to a four-module professional data dashboard. The target reference is the Maoyan Professional dashboard at https://piaofang.maoyan.com/dashboard: dense dark data UI, ranking-first workflow, real-time header, and fast inspection of ranked items.

The accepted direction is option B from the visual discussion:

- The comprehensive page shows four module rankings.
- Each module page shows a ranking table on the left and selected-item details on the right.
- The app should feel like a professional operations dashboard, not a content card feed or marketing page.

## Confirmed Scope

User-facing modules:

- Short drama: `drama`
- Novel: `novel`
- Anime: `anime`
- Comic: `comic`

Routes:

- `/` redirects to `/dashboard`.
- `/dashboard` shows all four module rankings.
- `/drama`, `/novel`, `/anime`, and `/comic` show one module with left ranking and right detail.
- `/detail/:id` remains available as a deep link and fallback.
- `/admin` remains available for data operations only.
- `/search` remains available but is visually secondary to the dashboard workflow.

Out of scope:

- Do not restore personal workspace pages.
- Do not restore complex comparison pages.
- Do not restore legacy AI recommendation workflows.
- Do not scrape or reproduce Maoyan movie data.
- Do not add marketing hero sections.

## Current Project Findings

- Frontend constants currently expose only `drama` and `novel`.
- Current tests explicitly lock the user-facing app to two modules and must be updated for four modules.
- Backend tests currently reject `comic` and `anime` content requests; this must change.
- Frontend test baseline has one known failure: `rankBoard.test.ts` imports `getBoardDisplayTotal`, but `rankBoard.ts` does not export it yet.
- Backend test baseline passes.
- `README.md` still describes older broad routes such as `/comic`, `/anime`, `/topics`, `/compare`, and `/me`; documentation and code constraints are out of sync.
- `Home.tsx` already has a dashboard-like ranking experience but still lacks the accepted left-ranking/right-detail module workflow.
- `index.css` contains too many global dashboard, rank, detail, card, and admin styles in one file, making polish risky.

## Information Architecture

### Comprehensive Dashboard

`/dashboard` is the default landing page. It shows four ranking panels in the first viewport:

- Short drama ranking
- Novel ranking
- Anime ranking
- Comic ranking

Each panel shows the top rows for that module:

- Rank
- Title
- Main category or tags
- Primary heat value
- Composite score

Clicking a row navigates to the module page with that item selected, using a query parameter such as:

```text
/drama?selected=drama%3Ahongguo%3Axxx
```

### Module Pages

Each module page uses the same layout:

- Left: full ranking table.
- Right: selected item detail panel.

Default selected item:

- The first visible ranking item is selected after data loads.
- If the URL has `selected`, the page tries to select that item.
- If filters remove the selected item, selection falls back to the first visible item.

Click behavior:

- Clicking a ranking row updates the right detail panel.
- It does not navigate to `/detail/:id`.
- `/detail/:id` remains available for direct links.

## Visual And Interaction Rules

The UI should follow a professional dashboard style:

- Dark background.
- Low border radius.
- Dense tables.
- Strong numeric hierarchy.
- Minimal decorative effects.
- Stable table columns.
- Tabular number alignment.
- Compact controls.

Header:

- Brand and product label.
- Navigation: comprehensive, short drama, novel, anime, comic.
- Ranking date.
- Beijing time.
- Refresh and fullscreen actions.
- Admin entry.

Comprehensive page:

- Four compact panels.
- No large card feed.
- No hero.
- No repeated explanatory panels.
- No decorative gradients or floating visual effects.

Module page:

- Ranking table remains the dominant element.
- Detail panel updates in place.
- Category filters, sort, refresh, and search live in the ranking toolbar.
- Mobile stacks ranking above detail.

## Data And Backend

The project remains JSON-first.

Type model:

```ts
type ContentType = 'drama' | 'novel' | 'anime' | 'comic';
```

Heat metric mapping:

- `drama`: playback
- `novel`: reading
- `anime`: playback
- `comic`: reading

Backend requirements:

- `GET /api/contents?type=anime` returns anime content.
- `GET /api/contents?type=comic` returns comic content.
- JSON status and preview APIs include all four modules.
- Auto refresh scope includes all four modules.
- Admin quality summaries include all four modules.
- Retired APIs stay retired.

Dataset requirements:

- Add `data/seeds/anime.json`.
- Add `data/seeds/comic.json`.
- Add `data/current/anime.json`.
- Add `data/current/comic.json`.
- Add matching snapshot data.
- Each module has at least 100 displayable records.
- Each record has valid rank, title, source, metrics, and relations where possible.

If anime and comic live crawlers are not ready, seed/current data may be used as a bootstrapping dataset, but source labels must remain explicit.

## Frontend Components

Create:

```text
frontend/src/components/dashboard/
  DashboardShell.tsx
  DashboardRankTable.tsx
  InlineContentDetail.tsx
  MetricQuad.tsx
```

Responsibilities:

- `DashboardShell`: dark page frame, top navigation, clock, refresh/fullscreen/admin actions.
- `DashboardRankTable`: shared dense ranking table for compact and full modes.
- `InlineContentDetail`: right-side detail panel for the selected item.
- `MetricQuad`: four core metrics plus composite score.

Pages:

```text
frontend/src/pages/
  Dashboard.tsx
  Home.tsx
```

- `Dashboard.tsx` fetches top rows for all four modules.
- `Home.tsx` fetches one module and manages filters, pagination, and selected row state.

Keep but demote:

- `ContentCard`
- `ContentGrid`
- `/search`
- `/detail/:id`

These should not drive the main dashboard workflow.

## Display Rules

Metrics:

- Playback and reading values display in the Chinese hundred-million unit: `yi` / `亿`.
- Empty values display `--` or a clear pending state.
- Composite score uses one decimal place.
- Table columns use tabular numbers.

Data quality:

- Filter empty titles.
- Filter mojibake text before rendering ranking rows.
- Filter unsupported content types.
- Avoid showing zero-signal crawler rows.

States:

- Loading rows should preserve table dimensions.
- Empty states stay compact and module-specific.
- Error states keep the dashboard shell visible.
- Refresh action is available when a request fails.

## Testing And Verification

Required commands:

```bash
npm run test:backend
npm run test:frontend
npm run build --workspace=frontend
```

Browser checks:

```text
http://127.0.0.1:5173/dashboard
http://127.0.0.1:5173/drama
http://127.0.0.1:5173/novel
http://127.0.0.1:5173/anime
http://127.0.0.1:5173/comic
```

Acceptance checks:

- `/dashboard` shows four ranking panels.
- Each module page uses left ranking and right detail.
- Clicking a ranking row updates the right detail panel without leaving the page.
- Anime and comic APIs return data.
- Frontend and backend tests agree on four visible modules.
- No visible mojibake in redesigned dashboard surfaces.
- No mobile overlap or unreadable table layout.
- README and design docs match the implemented scope.

## Implementation Order

1. Restore the frontend test baseline by exporting `getBoardDisplayTotal`.
2. Expand shared frontend content types and constants to four modules.
3. Update tests that currently enforce two modules.
4. Expand backend valid content types and heat metric mapping.
5. Add anime and comic JSON seeds/current/snapshots.
6. Update backend JSON status, auto refresh, preview, and quality summaries.
7. Create dashboard components.
8. Add `/dashboard`.
9. Rewrite module pages to left ranking and right detail.
10. Clean dashboard CSS and remove redundant panel styles.
11. Fix README and stale design references.
12. Run full tests, build, and browser verification.

## Design Approval Record

The user confirmed:

- Use four modules.
- Use option B: Maoyan-style professional dashboard.
- Comprehensive page displays four module rankings.
- Child module pages use left-side ranking and right-side detail.
- Information architecture, visual/interaction rules, data/backend boundary, component boundary, and quality gates are approved.


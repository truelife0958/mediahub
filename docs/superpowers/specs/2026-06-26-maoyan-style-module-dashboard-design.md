# Maoyan-Style Module Dashboard Redesign

## Background

The product goal is a pure data application for trending entertainment content. It should show four modules: short drama, novel, anime, and comic. The visual and interaction reference is the Maoyan Professional dashboard: dense dark dashboard, module navigation, left-side ranking table, and right-side details that update when a ranking row is clicked.

The app should not become a marketing page, recommendation feed, personal workspace, or complex admin system. It should focus on ranked data and fast inspection.

## Goals

- Provide one comprehensive dashboard that only shows the four module leaderboards.
- Provide a module page for each content type: short drama, novel, anime, comic.
- In each module page, show the leaderboard on the left and selected-item details on the right.
- Clicking a leaderboard row updates the right detail panel without navigating away.
- Keep `/detail/:id` as a deep link, but make inline details the primary workflow.
- Show all play and reading numbers in `亿`, without `次`.
- Fix all mojibake text in touched frontend pages and components.
- Filter abnormal or mojibake records before rendering them in rankings.
- Use JSON-first data and avoid adding a complex database.

## Non-Goals

- Do not scrape or reproduce Maoyan movie data.
- Do not fake external platform rankings.
- Do not rebuild the admin system in this pass.
- Do not add personal-space, recommendation, or duplicate overview sections.

## Information Architecture

Routes:

- `/` redirects to `/dashboard`.
- `/dashboard` shows comprehensive data with four compact leaderboard panels.
- `/drama`, `/novel`, `/anime`, `/comic` show module-specific ranking pages.
- `/detail/:id` remains available for direct links.
- `/admin` remains available but is not part of this redesign.

Top navigation:

- `综合数据`
- `短剧`
- `小说`
- `动漫`
- `漫画`

The header also shows current Beijing time and the current ranking date.

## Comprehensive Dashboard

The comprehensive page uses a Maoyan-style big-screen layout:

- Four panels: short drama ranking, novel ranking, anime ranking, comic ranking.
- Each panel shows the top records for that module.
- Each row shows rank, title, category, primary heat number, and composite score.
- Clicking a row opens the corresponding module page with that item selected.

This page is intentionally compact. It does not show side explanations, personal panels, repeated summary cards, or admin status.

## Module Page Layout

Each module page has two main areas:

- Left panel: full ranking table.
- Right panel: selected item detail.

Default selection:

- The first visible ranking item is selected after data loads.
- If the user clicks a row, that row becomes selected.
- If filtering removes the selected row, the first remaining item becomes selected.

Left leaderboard columns:

- Rank
- Title
- Category
- Actor or author
- Play or reading volume in `亿`
- Platform heat
- Search index
- Topic heat
- Composite score

Right detail fields:

- Title
- Module and rank
- Categories
- Actors for short drama, anime, and comic where available
- Author for novel and comic where available
- IP name
- Play or reading volume in `亿`
- Platform heat value
- Search index
- Topic heat
- Composite score
- Source label and source link when available
- Updated time
- Hot signals
- Related items by actor, author, IP, or category

## Metrics

The ranking score is based on four indicators:

- Play or reading volume
- Platform heat value
- Search index
- Topic heat

The frontend should display the four indicators separately and also show the composite score.

Display rules:

- `playOrReadYi` is shown as `x.xx 亿` or `x.x 亿` depending on scale.
- No metric display should append `次`.
- Empty or invalid metric values show `--`.
- Composite score uses one decimal place.

## Data Model

No backend API shape changes are required unless current validation prevents the two new modules.

Frontend should primarily consume existing `Content` fields:

- `id`
- `type`
- `title`
- `summary`
- `tags`
- `actors`
- `characters`
- `author`
- `ipName`
- `source`
- `metrics`
- `hotSignals`
- `leaderboardEvidence`
- `rank`
- `updatedAt`
- `cachedAt`

Backend JSON dataset services should support:

- `drama`
- `novel`
- `anime`
- `comic`

If anime or comic data is not available from crawlers yet, seed/current/snapshot JSON files should provide displayable records so the UI does not break.

## Components

Planned component boundaries:

- `DashboardShell`: page frame, dark dashboard background, header, module nav.
- `ModuleLeaderboardPage`: fetches one module, manages filters and selected item.
- `ComprehensiveDashboard`: renders the four compact module leaderboard panels.
- `DashboardRankTable`: dense ranking table with selected-row state.
- `InlineContentDetail`: right-side detail panel reused by module pages.
- `MetricQuad`: four-indicator score block.

Existing components may be reused where they fit, but mojibake text should be fixed instead of carried forward.

## Filtering And Data Quality

Records should not render if they have:

- Empty title
- Mojibake in title, summary, source, tags, actors, characters, author, or IP fields
- Missing or unsupported content type

Filtering should happen before ranking rows are passed to visual components.

If all records are filtered out, show a compact empty state with a refresh action.

## Error Handling

If the API request fails:

- Show a module-specific error state.
- Keep the header and module navigation visible.
- Provide a refresh button.

If a selected item is unavailable:

- Fall back to the first clean ranking item.
- If no item exists, show the empty state in the right panel.

## Testing

Frontend verification:

- `npm run test:frontend`
- `npm run build --workspace=frontend`

Backend verification:

- `npm run test:backend`

Browser checks:

- `/dashboard`
- `/drama`
- `/novel`
- `/anime`
- `/comic`

Acceptance checks:

- No mojibake in the redesigned pages.
- Module navigation works.
- Comprehensive dashboard only shows the four module leaderboards.
- Module pages show left leaderboard and right inline detail.
- Clicking a row updates the right panel without route navigation.
- Play and reading values use `亿` and do not show `次`.
- Abnormal records are filtered out.
- Refresh, category filtering, sorting, and load-more controls still work where present.

## Implementation Order

1. Fix the unfinished frontend rank-board test helper so tests return to a known baseline.
2. Expand visible and valid content types to include anime and comic.
3. Ensure JSON datasets exist for all four modules.
4. Replace the current module page layout with the left-ranking/right-detail layout.
5. Add the comprehensive dashboard route and module panels.
6. Fix mojibake in touched components and routes.
7. Run tests and browser verification.

# Chess Game Analyzer

Full-stack chess game analyzer built with Next.js 16. Syncs games from chess.com, runs Stockfish analysis, and provides filtering, replay, and statistics.

## Tech Stack

- **Frontend:** Next.js 16 (Turbopack, App Router)
- **Backend:** Next.js Server Actions + API Routes
- **Database:** PostgreSQL via `pg` (local) / `@vercel/postgres` (Vercel)
- **Shared Library:** [nextjs-shared](https://github.com/richardstuart007/nextjs-shared) for UI components and database utilities
- **Chess:** chess.js + react-chessboard + Stockfish WASM

## Local Development Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd nextjs-chess
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local PostgreSQL connection string
   ```

3. **Create the database:**
   ```bash
   createdb chess_analyzer
   npm run migrate
   ```

4. **Start the dev server:**
   ```bash
   npm run dev
   ```
   Opens at [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/chess_analyzer` |
| `NEXT_PUBLIC_APPENV_DBHANDLER` | DB driver: `PG` (local) or `VERCEL_PG` (Vercel) | `PG` |
| `NEXT_PUBLIC_APPENV_ISDEV` | Enable dev mode logging | `true` |
| `POSTGRES_DATABASE_LOCATION` | Label shown in dev watermark | `local` |

## Vercel Postgres Setup

1. Create a Vercel Postgres database in your Vercel project settings
2. The `POSTGRES_URL` and related vars are auto-populated by Vercel
3. Set `NEXT_PUBLIC_APPENV_DBHANDLER=VERCEL_PG` in Vercel environment settings
4. Run migration via Vercel CLI or seed script

## Database Migration

```bash
npm run migrate
```

Runs `lib/schema.sql` against the database specified in `POSTGRES_URL`.

## Shared Library Usage

This project uses [nextjs-shared](https://github.com/richardstuart007/nextjs-shared) for UI components and database utilities.

### UI Components

| Component | Import | Used In |
|---|---|---|
| `MyButton` | `nextjs-shared/MyButton` | PlayerSearch, PlayerProfile, GameFilters, ChessBoard |
| `MyInput` | `nextjs-shared/MyInput` | PlayerSearch, GameFilters |
| `MySelect` | `nextjs-shared/MySelect` | GameFilters (result, color, time class, sort) |
| `MyBox` | `nextjs-shared/MyBox` | PlayerSearch, PlayerProfile, GameFilters, GameList, DashboardStats, GameInsights |
| `MyPagination` | `nextjs-shared/MyPagination` | GameList |
| `MyPopup` | `nextjs-shared/MyPopup` | Game detail modal (planned) |
| `MyConfirmDialog` | `nextjs-shared/MyConfirmDialog` | Full Replace confirmation (planned) |
| `MyLoadingMessage` | `nextjs-shared/MyLoadingMessage` | PlayerSearch, sync progress |
| `MyHourGlass` | `nextjs-shared/MyHourGlass` | Loading states |
| `MyToggle` | `nextjs-shared/MyToggle` | Filter toggles (planned) |
| `MyLink` | `nextjs-shared/MyLink` | Navigation |
| `myMergeClasses` | `nextjs-shared/MyMergeClasses` | Custom component styling |

### Database Utilities

| Utility | Import | Used For |
|---|---|---|
| `db (sql)` | `nextjs-shared/db` | Database connection (PG / Vercel PG) |
| `table_fetch` | `nextjs-shared/table_fetch` | SELECT queries with WHERE, ORDER BY |
| `table_write` | `nextjs-shared/table_write` | INSERT operations |
| `table_update` | `nextjs-shared/table_update` | UPDATE operations |
| `table_delete` | `nextjs-shared/table_delete` | DELETE operations |
| `table_count` | `nextjs-shared/table_count` | COUNT queries |
| `table_check` | `nextjs-shared/table_check` | Existence checks |
| `fetchFiltered` | `nextjs-shared/fetchFiltered` | Paginated filtered queries |
| `fetchTotalPages` | `nextjs-shared/fetchTotalPages` | Page count for pagination |
| `write_Logging` | `nextjs-shared/write_logging` | Application logging |
| `ColumnValuePair` | `nextjs-shared/structures` | WHERE clause building |
| `Filter, JoinParams` | `nextjs-shared/tableFetchUtils` | Filtered query parameters |

## Phase 2 — AI Integration (Not Yet Implemented)

- `src/ui/dashboard/GameInsights.tsx` — Placeholder component showing "AI analysis coming soon"
- `src/lib/analyzeWithClaude.ts` — Commented-out stub ready for Anthropic SDK integration
- Will require `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY` environment variable

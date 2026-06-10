import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree } from '@/src/lib/analysis/buildPositionTree'
import { enrichGamesPartial } from '@/src/lib/analysis/enrichGames'
import { generateInsights } from '@/src/lib/analysis/generateInsights'
import { detectMistakes } from '@/src/lib/analysis/detectMistakes'
import { getPlayers } from '@/src/lib/actions/players'

// Independent analysis cron — does not modify the existing /api/cron/sync route.
// Call this after the main sync cron completes: schedule it ~5 minutes later.
// Requires the same CRON_SECRET as the main sync cron (or set ANALYSIS_CRON_SECRET).

export async function GET(req: NextRequest) {
  const secret = process.env.ANALYSIS_CRON_SECRET ?? process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const summary: Record<string, any> = {}

  try {
    // 1. Build position tree for new games (small batch — incremental)
    const treeResult = await buildPositionTree({ limit: 200 })
    summary.tree = treeResult
  } catch (err: any) {
    summary.tree = { error: err?.message }
  }

  try {
    // 2. PGN-only enrichment for unenriched games (server-side, fast)
    const players = await getPlayers()
    const enrichResults: Record<string, any> = {}
    for (const p of players) {
      try {
        const res = await enrichGamesPartial({ player: p.username, limit: 100 })
        enrichResults[p.username] = res
      } catch (e: any) {
        enrichResults[p.username] = { error: e?.message }
      }
    }
    summary.enrich = enrichResults
  } catch (err: any) {
    summary.enrich = { error: err?.message }
  }

  try {
    // 3. Detect habit mistakes / improvements for newly flagged positions
    const mistakeResult = await detectMistakes({ limit: 500 })
    summary.mistakes = mistakeResult
  } catch (err: any) {
    summary.mistakes = { error: err?.message }
  }

  try {
    // 4. Generate a small batch of AI insights
    const insightResult = await generateInsights({ limit: 10 })
    summary.insights = insightResult
  } catch (err: any) {
    summary.insights = { error: err?.message }
  }

  return NextResponse.json({ ok: true, summary })
}

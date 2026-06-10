import { NextRequest, NextResponse } from 'next/server'
import { deconstructGames } from '@/src/lib/actions/deconstruct'
import { getPlayers } from '@/src/lib/actions/players'

// Deconstruct-only route — reads tgr_gamesraw, writes tgd_gamesdecon.
// Does NOT sync from chess.com. Safe to run any time.
// GET /api/analysis/deconstruct                  → all players, all games
// GET /api/analysis/deconstruct?player=stricade  → one player
// GET /api/analysis/deconstruct?player=stricade&limit=500

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const playerParam = searchParams.get('player')
  const limit = Number(searchParams.get('limit') ?? '0')
  const oneBatch = searchParams.get('onebatch') === '1'

  try {
    const players = playerParam
      ? [{ username: playerParam }]
      : await getPlayers()

    const results: { username: string; processed: number; skipped: number; errors: number }[] = []

    for (const p of players) {
      const batchSize = limit > 0 ? limit : 500
      const acc = { processed: 0, skipped: 0, errors: 0 }

      while (true) {
        const res = await deconstructGames(p.username, batchSize)
        acc.processed += res.processed
        acc.skipped   += res.skipped
        acc.errors    += res.errors

        if (oneBatch) break
        if (res.processed === 0 && res.errors === 0 && res.skipped === 0) break
        if (res.processed === 0 && res.errors > 0) break
      }

      results.push({ username: p.username, ...acc })
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

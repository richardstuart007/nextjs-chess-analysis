import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player = searchParams.get('player') ?? 'stricade'

  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const [total, forPlayer, sample] = await Promise.all([
    db.query({ caller: 'diag', query: `SELECT COUNT(*) AS cnt FROM tgr_gamesraw`, params: [], functionName: 'diag' }),
    db.query({ caller: 'diag', query: `SELECT COUNT(*) AS cnt FROM tgr_gamesraw WHERE gr_player_username = $1`, params: [player], functionName: 'diag' }),
    db.query({ caller: 'diag', query: `SELECT DISTINCT gr_player_username FROM tgr_gamesraw LIMIT 10`, params: [], functionName: 'diag' }),
  ])

  return NextResponse.json({
    total_rows:       Number(total.rows[0]?.cnt ?? 0),
    rows_for_player:  Number(forPlayer.rows[0]?.cnt ?? 0),
    player_searched:  player,
    distinct_players: sample.rows.map((r: any) => r.gr_player_username),
  })
}

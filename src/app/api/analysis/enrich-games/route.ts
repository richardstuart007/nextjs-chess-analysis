import { NextRequest, NextResponse } from 'next/server'
import { enrichGamesPartial } from '@/src/lib/analysis/enrichGames'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit  = Number(searchParams.get('limit') ?? '100')
  const player = searchParams.get('player') ?? ''

  if (!player) {
    return NextResponse.json({ ok: false, error: 'player param required' }, { status: 400 })
  }

  try {
    const result = await enrichGamesPartial({ player, limit })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('enrich-games route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { enrichGamesStockfish } from '@/src/lib/analysis/enrichGamesStockfish'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? '50')
  const depth    = Number(searchParams.get('depth')  ?? '16')
  const dateFrom = searchParams.get('dateFrom') ?? undefined
  const dateTo   = searchParams.get('dateTo')   ?? undefined

  try {
    const result = await enrichGamesStockfish({ limit, depth, dateFrom, dateTo })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('enrich-games-stockfish route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

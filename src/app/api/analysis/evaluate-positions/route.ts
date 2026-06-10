import { NextRequest, NextResponse } from 'next/server'
import { enrichPositionsStockfish } from '@/src/lib/analysis/enrichPositionsStockfish'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')  ?? '50')
  const depth    = Number(searchParams.get('depth')  ?? '16')
  const dateFrom = searchParams.get('dateFrom') ?? undefined
  const dateTo   = searchParams.get('dateTo')   ?? undefined

  try {
    const result = await enrichPositionsStockfish({ limit, depth, dateFrom, dateTo })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('evaluate-positions route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

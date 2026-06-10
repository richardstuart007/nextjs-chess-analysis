import { NextRequest, NextResponse } from 'next/server'
import { buildPositionTree } from '@/src/lib/analysis/buildPositionTree'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit')   ?? '100')
  const minMove  = Number(searchParams.get('minMove') ?? '6')
  const maxMove  = Number(searchParams.get('maxMove') ?? '25')
  const player   = searchParams.get('player')   ?? undefined
  const dateFrom = searchParams.get('dateFrom') ?? undefined
  const dateTo   = searchParams.get('dateTo')   ?? undefined

  try {
    const result = await buildPositionTree({ limit, minMove, maxMove, playerUsername: player, dateFrom, dateTo })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('build-tree route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

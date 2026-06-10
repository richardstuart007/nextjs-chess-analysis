import { NextRequest, NextResponse } from 'next/server'
import { generateInsights } from '@/src/lib/analysis/generateInsights'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Number(searchParams.get('limit') ?? '20')
  const dateFrom = searchParams.get('dateFrom') ?? undefined
  const dateTo   = searchParams.get('dateTo')   ?? undefined

  try {
    const result = await generateInsights({ limit, dateFrom, dateTo })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('generate-insights route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

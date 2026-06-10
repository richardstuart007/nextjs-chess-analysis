import { NextRequest, NextResponse } from 'next/server'
import { generateBriefing } from '@/src/lib/analysis/generateBriefing'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player   = searchParams.get('player')   ?? ''
  const type     = (searchParams.get('type')    ?? 'W') as 'D' | 'W'
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo   = searchParams.get('dateTo')   ?? ''

  if (!player || !dateFrom || !dateTo) {
    return NextResponse.json({ ok: false, error: 'player, dateFrom and dateTo are required' }, { status: 400 })
  }

  try {
    const result = await generateBriefing({ player, type, dateFrom, dateTo })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('generate-briefing route error', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}

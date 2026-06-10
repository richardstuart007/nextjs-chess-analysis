'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import PositionDetail from '@/src/ui/analysis/PositionDetail'
import { getPositionDetail } from '@/src/lib/analysis/chessdb'

function PositionDetailContent() {
  const params = useParams()
  const fen = decodeURIComponent(params.fen as string)

  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPositionDetail(fen).then(d => {
      setData(d)
      setLoading(false)
    })
  }, [fen])

  if (loading) return <MyLoadingMessage message1="Loading position…" />

  return (
    <PositionDetail
      position={data?.position ?? null}
      moves={data?.moves ?? []}
      posEval={data?.posEval ?? null}
      insight={data?.insight ?? null}
      gameCount={data?.gameCount ?? 0}
      games={data?.games ?? []}
    />
  )
}

export default function PositionPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <PositionDetailContent />
    </Suspense>
  )
}

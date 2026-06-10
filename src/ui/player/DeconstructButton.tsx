'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import MyBox from 'nextjs-shared/MyBox'
import { deconstructGames, getUndeconstructedCount, getDeconstructedCount } from '@/src/lib/actions/deconstruct'

interface DeconstructButtonProps {
  username: string
  onComplete: () => void
}

export default function DeconstructButton({ username, onComplete }: DeconstructButtonProps) {
  const [limit, setLimit] = useState('100')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ processed: number; skipped: number; errors: number } | null>(null)
  const [counts, setCounts] = useState<{ remaining: number; done: number } | null>(null)

  async function handleCheckCounts() {
    const [remaining, done] = await Promise.all([
      getUndeconstructedCount(username),
      getDeconstructedCount(username)
    ])
    setCounts({ remaining, done })
  }

  async function handlePopulate() {
    setProcessing(true)
    setResult(null)

    try {
      const numLimit = limit === 'All' ? 0 : parseInt(limit, 10)
      const res = await deconstructGames(username, numLimit)
      setResult(res)
      await handleCheckCounts()
      onComplete()
    } catch (err) {
      console.error('Deconstruct failed:', err)
      setResult({ processed: 0, skipped: 0, errors: 1 })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <MyBox title='Populate Games'>
      <div className='space-y-2'>
        <div className='flex items-center gap-2'>
          <MySelect
            label='Records'
            options={['10', '50', '100', '500', '1000', 'All']}
            value={limit}
            onChange={e => setLimit(e.target.value)}
          />
          <MyButton
            onClick={handlePopulate}
            disabled={processing}
            overrideClass='text-xs'
          >
            {processing ? 'Processing...' : 'Populate'}
          </MyButton>
          <MyButton
            onClick={handleCheckCounts}
            overrideClass='text-xs bg-gray-500 hover:bg-gray-600'
          >
            Check
          </MyButton>
        </div>

        {counts && (
          <p className='text-xs text-gray-500'>
            Deconstructed: {counts.done} | Remaining: {counts.remaining}
          </p>
        )}

        {result && (
          <p className='text-xs'>
            <span className='text-green-600 font-bold'>Processed: {result.processed}</span>
            {result.skipped > 0 && <span className='ml-2 text-gray-500'>Skipped: {result.skipped}</span>}
            {result.errors > 0 && <span className='ml-2 text-red-600'>Errors: {result.errors}</span>}
          </p>
        )}
      </div>
    </MyBox>
  )
}

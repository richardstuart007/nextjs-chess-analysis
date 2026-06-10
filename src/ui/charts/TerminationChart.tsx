'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import MySelect from 'nextjs-shared/MySelect'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyButton } from 'nextjs-shared/MyButton'
import { getTerminationStats } from '@/src/lib/actions/games'

const TODAY = new Date().toISOString().slice(0, 10)

interface TerminationChartProps {
  players: string[]
}

export default function TerminationChart({ players }: TerminationChartProps) {
  const [username, setUsername] = useState(players[0] ?? '')
  const [color, setColor] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<{ termination: string; win: number; loss: number; draw: number; total: number }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!username) return
    let cancelled = false
    setLoading(true)
    async function load() {
      const rows = await getTerminationStats(
        username,
        dateFrom || undefined,
        dateTo || undefined,
        color || undefined
      )
      if (!cancelled) { setData(rows); setLoading(false) }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [username, color, dateFrom, dateTo])

  const chartData = data.map(r => ({
    name: r.termination,
    Win:  r.win,
    Loss: r.loss,
    Draw: r.draw,
    total: r.total
  }))

  return (
    <MyBox title='How Games End'>
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        {players.length > 1 && (
          <MySelect
            label='Player'
            options={players}
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        )}
        <MySelect
          label='Colour'
          options={['Both', 'White', 'Black']}
          value={color === 'white' ? 'White' : color === 'black' ? 'Black' : 'Both'}
          onChange={e => setColor(e.target.value === 'Both' ? '' : e.target.value.toLowerCase())}
        />
        <MyInput
          type='date'
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          overrideClass='w-32 text-xxs'
          placeholder='From'
          max={TODAY}
        />
        <MyInput
          type='date'
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          overrideClass='w-32 text-xxs'
          placeholder='To'
          max={TODAY}
        />
        {(dateFrom || dateTo) && (
          <MyButton
            onClick={() => { setDateFrom(''); setDateTo('') }}
            overrideClass='text-xxs px-2 h-5 bg-gray-400 hover:bg-gray-500'
          >
            Clear
          </MyButton>
        )}
      </div>

      {loading && <p className='text-xs text-gray-400'>Loading...</p>}

      {!loading && chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No data.</p>
      )}

      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width='100%' height={320}>
          <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' vertical={false} />
            <XAxis
              dataKey='name'
              tick={{ fontSize: 10 }}
              angle={-35}
              textAnchor='end'
              interval={0}
              height={60}
            />
            <YAxis tick={{ fontSize: 10 }} width={45} />
            <Tooltip
              formatter={(value, name, props) => {
                const total = (props as any).payload?.total ?? 0
                const pct = total > 0 && typeof value === 'number'
                  ? ` (${Math.round((value / total) * 100)}%)`
                  : ''
                return [`${value}${pct}`, name]
              }}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey='Win'  stackId='a' fill='#16a34a' />
            <Bar dataKey='Draw' stackId='a' fill='#6b7280' />
            <Bar dataKey='Loss' stackId='a' fill='#dc2626' radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </MyBox>
  )
}

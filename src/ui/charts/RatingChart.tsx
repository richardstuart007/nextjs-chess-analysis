'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import MyBox from 'nextjs-shared/MyBox'
import MySelect from 'nextjs-shared/MySelect'
import { RatingGranularity } from '@/src/lib/actions/games'

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea']

const GRAN_LABELS: Record<RatingGranularity, string> = {
  game: 'Per Game', day: 'Daily Avg', week: 'Weekly Avg', month: 'Monthly Avg'
}
const GRAN_MAP: Record<string, RatingGranularity> = {
  'Per Game': 'game', 'Daily Avg': 'day', 'Weekly Avg': 'week', 'Monthly Avg': 'month'
}
const POINT_DESC: Record<RatingGranularity, string> = {
  game:  'each point = 1 game',
  day:   'each point = daily average',
  week:  'each point = weekly average',
  month: 'each point = monthly average',
}

function availableGrans(spanDays: number): RatingGranularity[] {
  if (spanDays < 2)   return ['game']
  if (spanDays < 14)  return ['game', 'day']
  if (spanDays < 60)  return ['game', 'day', 'week']
  if (spanDays < 365) return ['day', 'week', 'month']
  return ['week', 'month']
}

function defaultGran(spanDays: number): RatingGranularity {
  if (spanDays < 2)   return 'game'
  if (spanDays < 14)  return 'game'
  if (spanDays < 60)  return 'day'
  if (spanDays < 365) return 'week'
  return 'month'
}

function aggregateForPlayer(rows: any[], granularity: RatingGranularity): { date: string; avgRating: number }[] {
  if (rows.length === 0) return []

  if (granularity === 'game') {
    return rows
      .map(row => ({
        date: new Date(row.gd_end_time * 1000).toISOString(),
        avgRating: row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const d = new Date(row.gd_end_time * 1000)
    let key: string
    if (granularity === 'day') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } else if (granularity === 'week') {
      const day = d.getDay()
      const mon = new Date(d)
      mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
      key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const rating = row.gd_player_color === 'white' ? row.gd_white_rating : row.gd_black_rating
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(rating)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ratings]) => ({
      date: key,
      avgRating: Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length)
    }))
}

function parseDate(d: string): Date {
  if (d.length > 10) return new Date(d)
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day ?? 1)
}

function generateDateTicks(fromMs: number, toMs: number, count: number): number[] {
  if (count <= 1) return [fromMs]
  return Array.from({ length: count }, (_, i) =>
    Math.round(fromMs + (i / (count - 1)) * (toMs - fromMs))
  )
}

interface RatingChartProps {
  games: any[]
}

export default function RatingChart({ games }: RatingChartProps) {
  // Derive unique (username, timeClass) series from the game data
  const allSeries = useMemo(() => {
    const seen = new Set<string>()
    const pairs: { username: string; timeClass: string; key: string; label: string }[] = []
    for (const g of games) {
      const key = `${g.gd_player_username}__${g.gd_time_class}`
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push({
          username:  g.gd_player_username as string,
          timeClass: g.gd_time_class as string,
          key,
          label: `${g.gd_player_username} (${g.gd_time_class})`
        })
      }
    }
    return pairs.sort((a, b) => a.label.localeCompare(b.label))
  }, [games])

  const allLabel = allSeries.length === 2 ? 'Both' : 'All'
  const filterOptions = allSeries.length > 1 ? [allLabel, ...allSeries.map(s => s.label)] : allSeries.map(s => s.label)

  const [seriesFilter, setSeriesFilter] = useState(allSeries.length > 1 ? allLabel : (allSeries[0]?.label ?? ''))
  const [granularityOverride, setGranularityOverride] = useState<RatingGranularity | null>(null)

  useEffect(() => {
    const labels = allSeries.map(s => s.label)
    setSeriesFilter(prev =>
      prev === allLabel || labels.includes(prev) ? prev : (allSeries.length > 1 ? allLabel : (allSeries[0]?.label ?? ''))
    )
  }, [allSeries.map(s => s.key).join(','), allLabel])

  const activeSeries = seriesFilter === allLabel ? allSeries : allSeries.filter(s => s.label === seriesFilter)

  const spanDays = useMemo(() => {
    if (games.length === 0) return 0
    const times = games.map((g: any) => g.gd_end_time as number)
    return Math.round((Math.max(...times) - Math.min(...times)) / 86400)
  }, [games])

  const available = availableGrans(spanDays)
  const granularity: RatingGranularity = granularityOverride && available.includes(granularityOverride)
    ? granularityOverride
    : defaultGran(spanDays)

  const series = useMemo(() =>
    activeSeries.map(s => ({
      key:   s.key,
      label: s.label,
      data:  aggregateForPlayer(
        games.filter((g: any) => g.gd_player_username === s.username && g.gd_time_class === s.timeClass),
        granularity
      )
    }))
  , [games, activeSeries.map(s => s.key).join(','), granularity])

  const { chartData, xTicks, fromMs, toMs, chartSpanDays } = useMemo(() => {
    const allDates = Array.from(
      new Set(series.flatMap(s => s.data.map(d => d.date)))
    ).sort()

    if (allDates.length === 0) return { chartData: [], xTicks: [], fromMs: 0, toMs: Date.now(), chartSpanDays: 0 }

    const dataFromMs = parseDate(allDates[0]).getTime()
    const dataToMs   = parseDate(allDates[allDates.length - 1]).getTime()
    const dataSpan   = dataToMs - dataFromMs
    const margin     = Math.max(dataSpan * 0.04, 1800000) // 4% or min 30 min
    const fromMs     = dataFromMs - margin
    const toMs       = dataToMs   + margin
    const chartSpanDays = Math.round((toMs - fromMs) / 86400000)

    const lookup = new Map<string, Map<string, number>>()
    for (const s of series) {
      const map = new Map<string, number>()
      for (const point of s.data) map.set(point.date, point.avgRating)
      lookup.set(s.key, map)
    }

    const data = allDates.map(dateStr => {
      const point: Record<string, number> = { ts: parseDate(dateStr).getTime() }
      for (const s of series) {
        const rating = lookup.get(s.key)?.get(dateStr)
        if (rating !== undefined) point[s.key] = rating
      }
      return point
    })

    const tickCount = chartSpanDays <= 1 ? 12 : chartSpanDays <= 7 ? 7 : chartSpanDays <= 60 ? 10 : 12
    const innerTicks = tickCount > 2 ? generateDateTicks(dataFromMs, dataToMs, tickCount).slice(1, -1) : []
    const xTicks = [...new Set([dataFromMs, ...innerTicks, dataToMs])]

    return { chartData: data, xTicks, fromMs, toMs, chartSpanDays }
  }, [series])

  const tickFormatter = (ts: number) => {
    const d = new Date(ts)
    if (chartSpanDays <= 1) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (chartSpanDays <= 92) return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
    if (chartSpanDays <= 400) return d.toLocaleString('default', { month: 'short' }) + ' \'' + String(d.getFullYear()).slice(2)
    return d.getMonth() === 0 ? String(d.getFullYear()) : ''
  }

  const labelFormatter = (ts: unknown) => {
    if (typeof ts !== 'number') return ''
    const d = new Date(ts)
    return chartSpanDays <= 92
      ? d.toLocaleString('default', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('default', { month: 'long', year: 'numeric' })
  }

  return (
    <MyBox title='Rating Over Time (data from games selection)'>
      <div className='mb-1 flex flex-wrap items-center gap-3'>
        {allSeries.length > 1 ? (
          <MySelect
            label='Player'
            options={filterOptions}
            value={seriesFilter}
            onChange={e => setSeriesFilter(e.target.value)}
          />
        ) : (
          <span className='text-xs text-gray-700'>{allSeries[0]?.label}</span>
        )}
        <MySelect
          label='Granularity'
          options={Object.entries(GRAN_LABELS)
            .filter(([k]) => available.includes(k as RatingGranularity))
            .map(([, v]) => v)}
          value={GRAN_LABELS[granularity]}
          onChange={e => setGranularityOverride(GRAN_MAP[e.target.value])}
        />
      </div>
      <p className='mb-3 text-xxs text-gray-400'>{POINT_DESC[granularity]}</p>

      {chartData.length === 0 && (
        <p className='text-xs text-gray-400'>No data — select a date range in the Games tab first.</p>
      )}

      {chartData.length > 0 && (
        <ResponsiveContainer width='100%' height={300}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis
              dataKey='ts'
              type='number'
              scale='time'
              domain={[fromMs, toMs]}
              ticks={xTicks}
              interval={0}
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9 }}
              height={30}
            />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={45} />
            <Tooltip
              labelFormatter={labelFormatter}
              formatter={(value, name) => [value, name]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type='monotone'
                dataKey={s.key}
                name={s.label}
                stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                dot={granularity === 'game' ? { r: 2 } : false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </MyBox>
  )
}

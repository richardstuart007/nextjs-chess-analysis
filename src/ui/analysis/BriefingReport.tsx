'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { BriefingResult } from '@/src/lib/analysis/generateBriefing'

interface BriefingReportProps {
  result: BriefingResult
}

const PHASE_COLORS: Record<string, string> = {
  OPENING:    '#3B82F6',
  MIDDLEGAME: '#F59E0B',
  ENDGAME:    '#6B7280'
}

export default function BriefingReport({ result }: BriefingReportProps) {
  const phaseData = result.phaseStats.map(p => ({ name: p.phase, value: p.count }))

  const paragraphs = result.narrative
    .split('\n\n')
    .filter(p => p.trim().length > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 text-white rounded-lg p-4">
        <h2 className="text-lg font-bold">{result.player}</h2>
        <p className="text-gray-300 text-sm">
          {result.dateFrom} — {result.dateTo} ·{' '}
          {result.gamesCt} game{result.gamesCt !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Alert: time losses */}
      {result.timeLossCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-semibold text-sm">
            {result.timeLossCount} game{result.timeLossCount !== 1 ? 's' : ''} lost on time from a winning position this period.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Phase doughnut */}
        {phaseData.length > 0 && (
          <div className="bg-white border rounded-lg p-4 md:col-span-1">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">Phase of Loss</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={phaseData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                  {phaseData.map((entry) => (
                    <Cell key={entry.name} fill={PHASE_COLORS[entry.name] ?? '#9CA3AF'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Stats */}
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Habit mistakes', value: result.mistakes, cls: result.mistakes > 5 ? 'text-red-600' : 'text-gray-800' },
            { label: 'Improvements',   value: result.improved,  cls: result.improved > 0  ? 'text-green-700' : 'text-gray-800' },
            { label: 'Avg lead changes', value: result.avgVolatility.toFixed(1), cls: 'text-gray-800' },
            { label: 'Time losses (winning)', value: result.timeLossCount, cls: result.timeLossCount > 0 ? 'text-red-600' : 'text-gray-800' }
          ].map(stat => (
            <div key={stat.label} className="bg-white border rounded-lg p-3">
              <div className={`text-2xl font-bold ${stat.cls}`}>{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Narrative */}
      <div className="bg-white border rounded-lg p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Coaching Notes</h3>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-gray-600 text-sm leading-relaxed">{p}</p>
        ))}
      </div>
    </div>
  )
}

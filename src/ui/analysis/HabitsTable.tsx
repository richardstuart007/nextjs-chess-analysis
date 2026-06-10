'use client'

import { useRouter } from 'next/navigation'
import { Chessboard } from 'react-chessboard'

interface HabitRow {
  pos_fen:     string
  pos_color:   string | null
  pos_cp:      number | null
  move_san:    string
  move_uci:    string | null
  move_times:  number
  move_wins:   number
  move_losses: number
  move_cp:     number | null
}

interface HabitsTableProps {
  rows: HabitRow[]
}

function cpClass(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp < 0) return 'text-red-600 font-semibold'
  return 'text-green-700'
}

function cpLabel(cp: number | null): string {
  if (cp === null) return '—'
  return `${cp > 0 ? '+' : ''}${cp.toFixed(2)}`
}

function pctLabel(n: number, total: number): string {
  if (total === 0) return '0.00%'
  return `${((n / total) * 100).toFixed(2)}%`
}

export default function HabitsTable({ rows }: HabitsTableProps) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No bad habits found. Run the pipeline (Build Position Tree + Evaluate Positions) then check your filter settings.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-3 py-2 w-20">Position</th>
            <th className="px-3 py-2 w-8">Colour</th>
            <th className="px-3 py-2 text-right">Pos CP</th>
            <th className="px-3 py-2">Move</th>
            <th className="px-3 py-2 text-right">Times</th>
            <th className="px-3 py-2 text-right">Win%</th>
            <th className="px-3 py-2 text-right">Loss%</th>
            <th className="px-3 py-2 text-right">CP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr
              key={`${row.pos_fen}-${row.move_san}-${i}`}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/analysis/position/${encodeURIComponent(row.pos_fen)}`)}
            >
              {/* Mini board */}
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 shrink-0">
                  <Chessboard
                    id={`mini-${i}-${row.pos_fen.slice(0, 16)}`}
                    position={row.pos_fen}
                    boardWidth={64}
                    arePiecesDraggable={false}
                    boardOrientation={row.pos_color === 'b' ? 'black' : 'white'}
                  />
                </div>
              </td>

              {/* Colour badge */}
              <td className="px-3 py-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                  row.pos_color === 'b'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-800 border border-gray-300'
                }`}>
                  {row.pos_color === 'b' ? 'B' : 'W'}
                </span>
              </td>

              {/* Position CP — score before the move */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono text-xs ${cpClass(row.pos_cp)}`}>
                {row.pos_cp != null ? (row.pos_cp > 0 ? `+${row.pos_cp}` : `${row.pos_cp}`) : '—'}
              </td>

              {/* Move */}
              <td className="px-3 py-2 font-mono font-semibold text-gray-800">
                {row.move_san}
              </td>

              {/* Times */}
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {row.move_times}
              </td>

              {/* Win% */}
              <td className="px-3 py-2 text-right tabular-nums text-green-700">
                {pctLabel(row.move_wins, row.move_times)}
              </td>

              {/* Loss% */}
              <td className="px-3 py-2 text-right tabular-nums text-red-600">
                {pctLabel(row.move_losses, row.move_times)}
              </td>

              {/* CP */}
              <td className={`px-3 py-2 text-right tabular-nums font-mono ${cpClass(row.move_cp)}`}>
                {cpLabel(row.move_cp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

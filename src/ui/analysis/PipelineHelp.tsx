'use client'

import { useState } from 'react'

//----------------------------------------------------------------------------------------------
//  STEPS — structured data flow for all 5 pipeline steps
//----------------------------------------------------------------------------------------------
const STEPS = [
  {
    num: '1',
    title: 'Game Sync',
    input: [
      'chess.com REST API — /pub/player/{username}/games/{year}/{month}',
    ],
    processing:
      'Downloads new games for all players. Parses PGN headers to extract opening name, ECO code, result, player ratings, time class (blitz/rapid/bullet) and termination type. Skips games already in the database.',
    output: [
      'tgr_gamesraw — one row per game per player: raw PGN and full JSON response from chess.com',
      'tgd_gamesdecon — parsed game fields: ECO, opening, result, ratings, time class, termination',
      'tplr_player_ratings — latest rating per player per time class',
    ],
  },
  {
    num: '2',
    title: 'Stockfish Analysis',
    input: [
      'tgr_gamesraw — PGN for each unenriched game',
    ],
    processing:
      'Replays every move in each game and evaluates with Stockfish. Calculates centipawn loss per move — how much worse the played move was compared to the engine best. Skips already-enriched games. Runs browser-side (WASM) or server-side (native binary, faster).',
    output: [
      'ten_enrichment — one row per game: avg CP loss, blunder count (>200 CP), mistake count (>100 CP), accuracy %, critical move number and CP drop, game phase of critical moment, lead changes, volatility',
    ],
  },
  {
    num: '3',
    title: 'Build Position Tree',
    input: [
      'tgr_gamesraw — PGN and game result for each game',
    ],
    processing:
      'Replays each game up to move 20 using chess.js. Records every unique board position (FEN) reached and the move played from it. Builds a frequency model showing which positions you reach repeatedly and what you play from them. Skips games already in the tree.',
    output: [
      'tpos_positions — unique FEN positions reached across all games',
      'tgam_game_positions — per-player, per-game record: position FEN, move played (SAN + UCI), resulting FEN, CP loss',
    ],
  },
  {
    num: '4',
    title: 'Evaluate Positions',
    input: [
      'tpos_positions — unique FEN positions not yet in teva_evaluations',
    ],
    processing:
      'Evaluates each unique board position from the tree with Stockfish. Normalises the centipawn score to white\'s perspective and records the best move. This step is required before Generate AI Insights can produce any results — if teva_evaluations is empty, step 5 returns 0. Run in batches; repeat until processed = 0.',
    output: [
      'teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI), search depth',
    ],
  },
  {
    num: '5',
    title: 'Generate AI Insights (deferred)',
    input: [
      'tpos_positions — positions to generate coaching advice for',
      'tgam_game_positions — moves played from each position with frequency',
      'teva_evaluations — Stockfish centipawn score per position',
    ],
    processing:
      'For each position that has a Stockfish evaluation but no insight yet, sends the FEN, CP score, and move history to an AI model. Returns a short coaching theme and practical improvement advice. Not currently wired into the pipeline — run manually via the API if needed.',
    output: [
      'tins_insights — one row per position: coaching theme (≤8 words), advice text (≤3 sentences), priority score used to rank the Habits page',
    ],
  },
]

const ROW_COUNT_SQL =
  `SELECT tbl, cnt FROM (
  SELECT 1 ord, 'tgr_gamesraw'         tbl, COUNT(*) cnt FROM tgr_gamesraw
  UNION ALL SELECT 2, 'tgd_gamesdecon',         COUNT(*) FROM tgd_gamesdecon
  UNION ALL SELECT 3, 'ten_enrichment',         COUNT(*) FROM ten_enrichment
  UNION ALL SELECT 4, 'tpos_positions',         COUNT(*) FROM tpos_positions
  UNION ALL SELECT 5, 'tgam_game_positions',    COUNT(*) FROM tgam_game_positions
  UNION ALL SELECT 6, 'teva_evaluations',       COUNT(*) FROM teva_evaluations
  UNION ALL SELECT 7, 'tins_insights',          COUNT(*) FROM tins_insights
) t ORDER BY ord;`

//----------------------------------------------------------------------------------------------
//  PipelineHelp — wider structured help popover for the Analysis Pipeline page
//----------------------------------------------------------------------------------------------
export default function PipelineHelp() {
  const [open, setOpen] = useState(false)

  return (
    <span className='inline-block'>
      <button
        onClick={() => setOpen(o => !o)}
        className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'
        type='button'
      >
        Help
      </button>

      {open && (
        <div className='absolute z-20 mt-1 left-0 w-[min(2000px,90vw)] max-h-[85vh] overflow-y-auto p-4 bg-blue-50 border border-blue-200 rounded-md shadow-xl text-xs'>

          <div className='flex justify-between items-center mb-3'>
            <p className='font-semibold text-blue-800 text-sm'>Analysis Pipeline — Data Flow</p>
            <button
              onClick={() => setOpen(false)}
              className='ml-4 text-gray-400 hover:text-gray-700 text-base leading-none font-bold'
              type='button'
            >
              ×
            </button>
          </div>

          <div className='space-y-3'>
            {STEPS.map(step => (
              <div key={step.num} className='bg-white border border-blue-100 rounded'>
                <div className='bg-blue-100 px-3 py-1.5 rounded-t'>
                  <p className='font-semibold text-blue-800'>Step {step.num} — {step.title}</p>
                </div>
                <table className='w-full text-xs border-collapse'>
                  <tbody>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 w-24 px-3 py-2 border-b border-gray-100 whitespace-nowrap'>Input</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>
                        {step.input.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2 border-b border-gray-100'>Processing</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>{step.processing}</td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2'>Output</td>
                      <td className='text-gray-700 px-3 py-2'>
                        {step.output.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <div className='bg-white border border-blue-100 rounded p-3'>
              <p className='font-semibold text-gray-600 mb-2'>Row Count SQL</p>
              <pre className='text-gray-700 font-mono text-xs whitespace-pre overflow-x-auto leading-relaxed'>{ROW_COUNT_SQL}</pre>
            </div>
          </div>

        </div>
      )}
    </span>
  )
}

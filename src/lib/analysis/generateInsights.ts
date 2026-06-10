'use server'

import { Chess } from 'chess.js'
import { getPositionsNeedingInsights, saveInsight } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { write_Logging } from 'nextjs-shared/write_logging'

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen)
    const move  = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? undefined })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

async function countInsightStats(
  dateFrom?: string,
  dateTo?:   string
): Promise<{ insights: number; remaining: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'generateInsights_count',
      query: `SELECT
        (SELECT COUNT(*) FROM tins_insights i
         WHERE EXISTS (
           SELECT 1 FROM tgam_game_positions gp
           JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE gp.gam_pos_fen = i.ins_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         )) AS insights,
        (SELECT COUNT(*) FROM tpos_positions p
         LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
         WHERE i.ins_id IS NULL
           AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
           AND EXISTS (
             SELECT 1 FROM tgam_game_positions gp
             JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
             WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
           )) AS remaining`,
      params:       [fromTs, toTs],
      functionName: 'generateInsights'
    })
    return {
      insights:  parseInt(res.rows[0]?.insights  ?? '0'),
      remaining: parseInt(res.rows[0]?.remaining ?? '0')
    }
  }

  const res = await db.query({
    caller: 'generateInsights_count',
    query: `SELECT
      (SELECT COUNT(*) FROM tins_insights) AS insights,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
       WHERE i.ins_id IS NULL
         AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
      ) AS remaining`,
    params:       [],
    functionName: 'generateInsights'
  })
  return {
    insights:  parseInt(res.rows[0]?.insights  ?? '0'),
    remaining: parseInt(res.rows[0]?.remaining ?? '0')
  }
}

interface MoveInfo {
  san: string
  uci: string
  times: number
}

async function callOllama(
  fen: string,
  reached: number,
  bestMoveSan: string,
  topMoveSan: string,
  topMoveTimes: number
): Promise<{ theme: string; advice: string } | null> {
  const ollamaUrl = process.env.OLLAMA_URL   ?? 'http://localhost:11434'
  const model     = process.env.OLLAMA_MODEL ?? 'qwen3:8b'

  const prompt = `You are a chess coach. Respond ONLY with valid JSON — no other text, no markdown.

Position (FEN): ${fen}
Reached ${reached} times.
Player's most common move: ${topMoveSan} (played ${topMoveTimes} times)
Stockfish best move: ${bestMoveSan}

The player repeatedly plays ${topMoveSan} instead of Stockfish's ${bestMoveSan}.

STRICT RULES — violating these makes the advice useless:
- Do NOT mention any move other than ${topMoveSan} and ${bestMoveSan}
- Do NOT suggest Be7, Be6, Nf3, or any other move not listed above
- Only explain why ${bestMoveSan} is better than ${topMoveSan} using chess principles

Provide:
1. theme: max 6 words naming what type of mistake playing ${topMoveSan} represents
2. advice: 1-2 sentences explaining only why ${bestMoveSan} is stronger than ${topMoveSan}

Respond ONLY with: { "theme": "...", "advice": "..." }`

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, temperature: 0, format: 'json' })
  })

  if (!response.ok) {
    await write_Logging({ lg_msg: `generateInsights: Ollama error ${response.status}`, lg_severity: 'E', lg_functionname: 'generateInsights' })
    return null
  }

  const data = await response.json()
  const text = data.response ?? ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      await write_Logging({ lg_msg: 'generateInsights: no JSON in Ollama response: ' + text, lg_severity: 'E', lg_functionname: 'generateInsights' })
      return null
    }
    const parsed = JSON.parse(match[0])
    if (typeof parsed.theme === 'string' && typeof parsed.advice === 'string') {
      return { theme: parsed.theme, advice: parsed.advice }
    }
  } catch {
    await write_Logging({ lg_msg: 'generateInsights: failed to parse Ollama response: ' + text, lg_severity: 'E', lg_functionname: 'generateInsights' })
  }
  return null
}

function topMoveMatchesBest(moves: MoveInfo[], bestMove: string): boolean {
  if (!moves.length || !bestMove) return false
  const top = moves[0]
  return top.uci === bestMove || top.uci.slice(0, 4) === bestMove.slice(0, 4)
}

export async function generateInsights(opts: { limit?: number; dateFrom?: string; dateTo?: string }): Promise<{
  processed: number
  errors: number
}> {
  const positions = await getPositionsNeedingInsights(opts.limit ?? 20, opts.dateFrom, opts.dateTo)
  const { insights: insightsBefore, remaining: remainingBefore } = await countInsightStats(opts.dateFrom, opts.dateTo)
  let errors = 0
  const t0   = Date.now()
  const logId = await startPipelineLog(5, 'Generate AI Insights', positions.length, insightsBefore, remainingBefore, opts.dateFrom, opts.dateTo)

  let skipped = 0
  for (const pos of positions) {
    if (!pos.best_move || topMoveMatchesBest(pos.moves, pos.best_move)) {
      skipped++
      continue
    }
    try {
      const bestMoveSan = uciToSan(pos.pos_fen, pos.best_move)
      const topMove     = pos.moves[0]
      const result = await callOllama(pos.pos_fen, pos.pos_reached, bestMoveSan, topMove.san, topMove.times)
      if (!result) { errors++; continue }

      const priority = pos.pos_reached * (pos.pos_cp != null ? Math.abs(pos.pos_cp) : 50)

      await saveInsight({
        posFen:   pos.pos_fen,
        theme:    result.theme,
        advice:   result.advice,
        priority
      })
    } catch (err) {
      await write_Logging({ lg_msg: 'generateInsights: error for FEN ' + pos.pos_fen + ': ' + (err as Error).message, lg_severity: 'E', lg_functionname: 'generateInsights' })
      errors++
    }
  }

  const processed = positions.length - errors
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, insightsBefore + processed)
  return { processed, errors }
}

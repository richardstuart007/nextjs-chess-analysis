'use server'

import { getBriefingData, saveBriefing, saveBriefingDetail } from './chessdb'

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

export interface BriefingOptions {
  player: string
  type: 'D' | 'W'
  dateFrom: string
  dateTo: string
}

export interface BriefingResult {
  breId: number
  player: string
  dateFrom: string
  dateTo: string
  gamesCt: number
  mistakes: number
  improved: number
  narrative: string
  phaseStats: Array<{ phase: string; count: number }>
  timeLossCount: number
  avgVolatility: number
}

async function callClaudeNarrative(opts: {
  player: string
  dateFrom: string
  dateTo: string
  gamesCt: number
  wins: number
  losses: number
  draws: number
  timeLossCount: number
  habitMistakes: number
  improvements: number
  phaseStats: Array<{ phase: string; count: number }>
  avgVolatility: number
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'Narrative unavailable — ANTHROPIC_API_KEY not configured.'

  const phaseText = opts.phaseStats
    .map(p => `${p.phase}: ${p.count}`)
    .join(', ')

  const userPrompt = `Player: ${opts.player}
Period: ${opts.dateFrom} to ${opts.dateTo}
Games played: ${opts.gamesCt} (Wins: ${opts.wins}, Losses: ${opts.losses}, Draws: ${opts.draws})
Time losses from winning position: ${opts.timeLossCount}
Repeated habit mistakes: ${opts.habitMistakes}
Improvements vs habit: ${opts.improvements}
Phase of most losses: ${phaseText || 'unknown'}
Average lead changes per game: ${opts.avgVolatility.toFixed(1)}

Write a 3-paragraph coaching briefing covering:
1. Overall assessment
2. Key weaknesses to address
3. Positive trends and what to focus on this week

Be encouraging but honest. Use plain English, no chess jargon.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: 'You are a chess coach writing a personal improvement briefing. Be encouraging but honest. Use plain English, no jargon.',
      messages: [{ role: 'user', content: userPrompt }]
    })
  })

  if (!response.ok) return 'Failed to generate narrative.'

  const data = await response.json()
  return data?.content?.[0]?.text ?? 'Narrative unavailable.'
}

export async function generateBriefing(opts: BriefingOptions): Promise<BriefingResult> {
  const { gamePositions, habitCount, improvedCount, phaseStats, enrichmentRows } =
    await getBriefingData({ player: opts.player, dateFrom: opts.dateFrom, dateTo: opts.dateTo })

  const timeLossRows = enrichmentRows.filter(e => e.en_time_loss_flag === 'TIME_WIN')
  const timeLossCount = timeLossRows.length

  const avgVolatility = enrichmentRows.length > 0
    ? enrichmentRows.reduce((s, e) => s + (e.en_volatility ?? 0), 0) / enrichmentRows.length
    : 0

  // Count wins/losses/draws from enrichment rows by checking termination for 'resign' / etc.
  // Use phase distribution as proxy; actual W/L/D from tgd_gamesdecon not joined here
  // Simple approach: count from game positions (each game appears once per position, use set)
  const uniqueGames = new Set(gamePositions.map(g => g.gam_game_ref))
  const gamesCt     = uniqueGames.size

  const narrative = await callClaudeNarrative({
    player:         opts.player,
    dateFrom:       opts.dateFrom,
    dateTo:         opts.dateTo,
    gamesCt,
    wins:           0,  // would need another join — omitted for now
    losses:         0,
    draws:          0,
    timeLossCount,
    habitMistakes:  habitCount,
    improvements:   improvedCount,
    phaseStats,
    avgVolatility
  })

  const breId = await saveBriefing({
    player:    opts.player,
    type:      opts.type,
    dateFrom:  opts.dateFrom,
    dateTo:    opts.dateTo,
    gamesCt,
    mistakes:  habitCount,
    improved:  improvedCount,
    narrative
  })

  await saveBriefingDetail(breId, gamePositions.slice(0, 100).map(g => ({
    posFen:      g.gam_pos_fen,
    movePlayed:  g.gam_move_played,
    moveNum:     g.gam_move_num,
    cpLoss:      g.gam_cp_loss,
    isHabit:     g.gam_is_habit,
    isImproved:  g.gam_is_improved,
    gameRef:     g.gam_game_ref,
    player:      g.gam_player
  })))

  return {
    breId,
    player:       opts.player,
    dateFrom:     opts.dateFrom,
    dateTo:       opts.dateTo,
    gamesCt,
    mistakes:     habitCount,
    improved:     improvedCount,
    narrative,
    phaseStats,
    timeLossCount,
    avgVolatility
  }
}

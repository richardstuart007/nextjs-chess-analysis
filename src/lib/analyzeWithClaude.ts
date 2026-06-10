// ============================================================================
// Phase 2 — AI-powered game analysis via Anthropic Claude API
// ============================================================================
//
// This module is a stub for future integration with the Anthropic SDK.
// When implemented, it will:
//
// 1. Accept a game's PGN and per-move Stockfish evaluations
// 2. Send them to the Claude API for natural-language analysis
// 3. Return insights such as:
//    - Critical moment identification
//    - Strategic theme recognition
//    - Personalized improvement suggestions
//    - Opening preparation recommendations
//
// Prerequisites for Phase 2:
// - npm install @anthropic-ai/sdk
// - Add ANTHROPIC_API_KEY to .env
// - Uncomment and implement the functions below
//
// ============================================================================

// import Anthropic from '@anthropic-ai/sdk'
//
// const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY
// })
//
// interface GameAnalysisInput {
//   pgn: string
//   evaluations: { move: string; cp: number; classification: string }[]
//   playerColor: 'white' | 'black'
//   timeControl: string
//   opponentRating: number
// }
//
// interface GameAnalysisResult {
//   summary: string
//   criticalMoments: { moveNumber: number; description: string }[]
//   themes: string[]
//   suggestions: string[]
// }
//
// export async function analyzeWithClaude(
//   input: GameAnalysisInput
// ): Promise<GameAnalysisResult> {
//   const message = await anthropic.messages.create({
//     model: 'claude-sonnet-4-20250514',
//     max_tokens: 1024,
//     messages: [
//       {
//         role: 'user',
//         content: `Analyze this chess game...\nPGN: ${input.pgn}\nEvaluations: ${JSON.stringify(input.evaluations)}`
//       }
//     ]
//   })
//
//   // Parse and return structured analysis
//   return JSON.parse(message.content[0].type === 'text' ? message.content[0].text : '{}')
// }

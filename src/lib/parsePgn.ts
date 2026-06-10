/**
 * Parse PGN headers and extract game metadata
 */

export interface PgnHeaders {
  eco: string
  ecoUrl: string
  openingName: string
  termination: string
  utcDate: string
  timeControl: string
  result: string
}

/**
 * Extract a single PGN header value by tag name
 */
function getHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))
  return match?.[1] ?? ''
}

/**
 * Parse all relevant headers from a PGN string
 */
export function parsePgnHeaders(pgn: string): PgnHeaders {
  const eco = getHeader(pgn, 'ECO')
  const ecoUrl = getHeader(pgn, 'ECOUrl')
  const termination = getHeader(pgn, 'Termination')
  const utcDate = getHeader(pgn, 'UTCDate')
  const timeControl = getHeader(pgn, 'TimeControl')
  const result = getHeader(pgn, 'Result')

  const openingName = extractOpeningName(ecoUrl, eco)

  return { eco, ecoUrl, openingName, termination, utcDate, timeControl, result }
}

/**
 * Extract opening name from ECOUrl
 * Input:  "https://www.chess.com/openings/Sicilian-Defense-Hyperaccelerated-Dragon"
 * Output: "Sicilian Defense Hyperaccelerated Dragon"
 *
 * Also handles move suffixes like:
 * "https://www.chess.com/openings/Sicilian-Defense-2...d6-3.d4"
 * → "Sicilian Defense"  (strip move notation)
 */
export function extractOpeningName(ecoUrl: string, _ecoCode: string): string {
  if (!ecoUrl) return ''

  // Extract the path after /openings/
  const match = ecoUrl.match(/\/openings\/([^?#]+)/)
  if (!match) return ''

  let name = match[1]

  // Remove move notation suffixes (e.g., "-2...d6-3.d4", "-1...g6-2.g3")
  // These patterns are: -N...move or -N.move where N is a number
  name = name.replace(/-\d+\.{1,3}[a-zA-Z0-9+#=].*$/, '')

  // Replace hyphens with spaces
  name = name.replace(/-/g, ' ')

  // Clean up extra spaces
  name = name.replace(/\s+/g, ' ').trim()

  return name
}

/**
 * Count half-moves (ply) from PGN move text
 * Strips headers, comments, and annotations, then counts moves
 */
export function countMoves(pgn: string): number {
  // Remove headers (lines starting with [)
  const moveText = pgn.replace(/\[.*?\]\s*/g, '').trim()

  // Remove comments {}, annotations like $1, and result
  const cleaned = moveText
    .replace(/\{[^}]*\}/g, '')    // remove {comments}
    .replace(/\$\d+/g, '')         // remove $annotations
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '') // remove result
    .replace(/\d+\.\.\./g, '')    // remove "N..." continuation notation
    .replace(/\d+\./g, '')        // remove move numbers "N."
    .trim()

  if (!cleaned) return 0

  // Split by whitespace, each token is a half-move
  const moves = cleaned.split(/\s+/).filter(m => m.length > 0)
  return moves.length
}

/**
 * Extract first N half-moves from a PGN string, stripped of headers/comments/annotations.
 * Used for sorting and displaying opening move sequences.
 * Output: "e4 e5 Nf3 Nc6 Bb5 a6 ..."
 */
export function parsePgnOpening(pgn: string, halfMoves: number = 999): string {
  const moveText = pgn.replace(/\[.*?\]\s*/gs, '').trim()
  const cleaned = moveText
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')
    .replace(/\d+\.{1,3}/g, '')
    .trim()
  const moves = cleaned.split(/\s+/).filter(m => m.length > 0)
  return moves.slice(0, halfMoves).join(' ')
}

/**
 * Parse UTCDate header "YYYY.MM.DD" to a Date-compatible string "YYYY-MM-DD"
 */
export function parsePlayedDate(utcDate: string): string | null {
  if (!utcDate) return null
  // Convert "2026.04.13" to "2026-04-13"
  return utcDate.replace(/\./g, '-')
}

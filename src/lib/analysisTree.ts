import { Chess } from 'chess.js'
import { MoveEvaluation } from './stockfish'

// --------------------------------------------------------------------------
//  Types
// --------------------------------------------------------------------------

export interface MoveNode {
  id: string
  san: string
  from: string
  to: string
  fen: string
  fenBefore: string
  parent: MoveNode | null
  children: MoveNode[]
  evaluation?: MoveEvaluation
  isMainLine: boolean
}

export interface AnalysisTree {
  root: MoveNode          // sentinel – fen = starting position, san = ''
  mainLine: MoveNode[]    // flat cache of main-line nodes
}

export interface MultiPvResult {
  rank: number
  cp: number
  bestMoveUci: string
  bestMoveSan: string
  lineSans: string[]
  lineUci: string[]
}

// --------------------------------------------------------------------------
//  Build tree from a parsed game
// --------------------------------------------------------------------------

export function buildTree(
  history: { san: string; from: string; to: string }[],
  fens: string[],
  evaluations: MoveEvaluation[]
): AnalysisTree {
  // Sentinel root (position before move 1)
  const root: MoveNode = {
    id: 'root',
    san: '',
    from: '',
    to: '',
    fen: fens[0],
    fenBefore: fens[0],
    parent: null,
    children: [],
    isMainLine: true
  }

  const mainLine: MoveNode[] = []
  let prev = root

  for (let i = 0; i < history.length; i++) {
    const node: MoveNode = {
      id: `main-${i}`,
      san: history[i].san,
      from: history[i].from,
      to: history[i].to,
      fen: fens[i + 1],
      fenBefore: fens[i],
      parent: prev,
      children: [],
      evaluation: evaluations[i],
      isMainLine: true
    }
    prev.children.push(node)
    mainLine.push(node)
    prev = node
  }

  return { root, mainLine }
}

// --------------------------------------------------------------------------
//  Add a branch move as a child of `parent`
// --------------------------------------------------------------------------

let branchCounter = 0

export function addBranch(
  parent: MoveNode,
  san: string,
  from: string,
  to: string,
  fen: string
): MoveNode {
  // Check if this exact move already exists as a child
  const existing = parent.children.find(c => c.san === san)
  if (existing) return existing

  const node: MoveNode = {
    id: `var-${branchCounter++}`,
    san,
    from,
    to,
    fen,
    fenBefore: parent.fen,
    parent,
    children: [],
    isMainLine: false
  }
  parent.children.push(node)
  return node
}

// --------------------------------------------------------------------------
//  Add a full PV line as a chain of branch nodes
// --------------------------------------------------------------------------

export function addPvBranch(
  parent: MoveNode,
  lineSans: string[]
): MoveNode | null {
  if (lineSans.length === 0) return null

  try {
    const g = new Chess(parent.fen)
    let current = parent
    let firstNode: MoveNode | null = null

    for (const san of lineSans) {
      // Try SAN first, fall back to searching legal moves
      let result = g.move(san)
      if (!result) {
        // Try finding the move in legal moves (handles minor notation differences)
        const legalMoves = g.moves({ verbose: true })
        const match = legalMoves.find(m => m.san === san || m.lan === san)
        if (match) {
          result = g.move(match.san)
        }
        if (!result) break
      }
      current = addBranch(current, result.san, result.from, result.to, g.fen())
      if (!firstNode) firstNode = current
    }

    return firstNode
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------
//  Get path from root to a node (inclusive of node, exclusive of root)
// --------------------------------------------------------------------------

export function getPath(node: MoveNode): MoveNode[] {
  const path: MoveNode[] = []
  let current: MoveNode | null = node
  while (current && current.san !== '') {
    path.unshift(current)
    current = current.parent
  }
  return path
}

// --------------------------------------------------------------------------
//  Replay a path to get a Chess instance at that position
// --------------------------------------------------------------------------

export function replayToNode(node: MoveNode): Chess {
  const path = getPath(node)
  const g = new Chess()
  for (const n of path) {
    g.move(n.san)
  }
  return g
}

// --------------------------------------------------------------------------
//  Find the main-line ancestor (walk up until isMainLine)
// --------------------------------------------------------------------------

export function findMainLineAncestor(node: MoveNode): MoveNode {
  let current: MoveNode | null = node
  while (current && !current.isMainLine) {
    current = current.parent
  }
  return current ?? node
}

// --------------------------------------------------------------------------
//  Check if a node is on the main line
// --------------------------------------------------------------------------

export function isOnMainLine(node: MoveNode | null): boolean {
  if (!node) return true
  let current: MoveNode | null = node
  while (current) {
    if (!current.isMainLine) return false
    current = current.parent
  }
  return true
}

// --------------------------------------------------------------------------
//  Get main-line index for a node (-1 if not on main line)
// --------------------------------------------------------------------------

export function getMainLineIndex(node: MoveNode, tree: AnalysisTree): number {
  return tree.mainLine.indexOf(node)
}

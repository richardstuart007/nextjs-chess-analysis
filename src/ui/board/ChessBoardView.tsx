'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Chess, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import { ChessComGame, getPlayerResult } from '@/src/lib/chesscom'
import { parsePgnHeaders } from '@/src/lib/parsePgn'
import { StockfishEngine, MoveEvaluation, STOCKFISH_DEFAULTS, InfiniteAnalysisUpdate } from '@/src/lib/stockfish'
import { saveGameEvaluations, saveAnalysisLine, saveAnalysisTree } from '@/src/lib/actions/games'
import {
  MoveNode,
  AnalysisTree,
  MultiPvResult,
  buildTree,
  addBranch,
  addPvBranch,
  getPath,
  replayToNode,
  findMainLineAncestor,
  isOnMainLine,
  getMainLineIndex
} from '@/src/lib/analysisTree'
import AlternativeLines from './AlternativeLines'
import MoveTree from './MoveTree'

interface ChessBoardViewProps {
  game?: ChessComGame
  gameRef?: string
  username: string
  stockfishDepth?: number
  stockfishMultiPv?: number
  onStockfishDepthChange?: (depth: number) => void
  onStockfishMultiPvChange?: (multiPv: number) => void
  onBack: () => void
}

const CLASSIFICATION_SQUARE_COLORS: Record<string, string> = {
  blunder: 'rgba(239, 68, 68, 0.6)',
  mistake: 'rgba(249, 115, 22, 0.6)',
  inaccuracy: 'rgba(234, 179, 8, 0.5)'
}

function formatCp(cp: number): string {
  if (Math.abs(cp) >= 10000) {
    return cp > 0 ? `M${10000 - cp}` : `-M${10000 + cp}`
  }
  const val = (cp / 100).toFixed(1)
  return cp > 0 ? `+${val}` : val
}

export default function ChessBoardView({ game, gameRef, username, stockfishDepth, stockfishMultiPv, onStockfishDepthChange, onStockfishMultiPvChange, onBack }: ChessBoardViewProps) {
  const isFreeAnalysis = !game
  const playerColor = game ? getPlayerResult(game, username).color : 'white' as const
  const result = game ? getPlayerResult(game, username).result : ''
  const { openingName: opening, eco } = game?.pgn ? parsePgnHeaders(game.pgn) : { openingName: (game as any)?._openingName ?? '', eco: (game as any)?._ecoCode ?? '' }

  // Tree state
  const [tree, setTree] = useState<AnalysisTree | null>(null)
  const [currentNode, setCurrentNode] = useState<MoveNode | null>(null)

  // Display chess instance
  const displayGame = useRef(new Chess())

  // Analysis state
  const [evaluations, setEvaluations] = useState<MoveEvaluation[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; move?: string }>({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState('')
  const engineRef = useRef<StockfishEngine | null>(null)

  // Exploration mode
  const [explorationMode, setExplorationMode] = useState(true)
  const [multiPvResults, setMultiPvResults] = useState<MultiPvResult[]>([])
  const [multiPvLoading, setMultiPvLoading] = useState(false)

  // Engine lock to prevent concurrent calls
  const engineBusy = useRef(false)

  // Deep analysis state
  const [deepAnalyzing, setDeepAnalyzing] = useState(false)
  const [deepAnalysisData, setDeepAnalysisData] = useState<InfiniteAnalysisUpdate | null>(null)

  // Save state
  const [saveMessage, setSaveMessage] = useState('')

  // Force re-render on board changes (displayGame is a ref)
  const [boardKey, setBoardKey] = useState(0)

  // -----------------------------------------------------------------------
  // Parse PGN on mount → build tree (or blank board for free analysis)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (game) {
      const g = new Chess()
      g.loadPgn(game.pgn)

      const moves = g.history({ verbose: true })
      const history = moves.map(m => ({ san: m.san, from: m.from, to: m.to }))

      const g2 = new Chess()
      const fens = [g2.fen()]
      for (const m of moves) {
        g2.move(m.san)
        fens.push(g2.fen())
      }

      const newTree = buildTree(history, fens, [])

      const storedEvals = (game as any)._evaluations as MoveEvaluation[] | null
      if (storedEvals && storedEvals.length > 0) {
        for (let i = 0; i < Math.min(storedEvals.length, newTree.mainLine.length); i++) {
          newTree.mainLine[i].evaluation = storedEvals[i]
        }
        setEvaluations(storedEvals)
      } else {
        setEvaluations([])
      }

      setTree(newTree)
      setCurrentNode(null)
      setExplorationMode(true)
    } else {
      const startFen = new Chess().fen()
      const newTree = buildTree([], [startFen], [])
      setTree(newTree)
      setCurrentNode(null)
      setExplorationMode(true)
      setEvaluations([])
    }
    displayGame.current = new Chess()
    setBoardKey(k => k + 1)
  }, [game])

  // -----------------------------------------------------------------------
  // Navigate to a tree node
  // -----------------------------------------------------------------------
  const goToNode = useCallback((node: MoveNode | null) => {
    setCurrentNode(node)
    if (!node || node.san === '') {
      displayGame.current = new Chess()
    } else {
      displayGame.current = replayToNode(node)
    }
    setBoardKey(k => k + 1)
  }, [])

  // Navigate main line by index (for slider)
  const goToMainLineIndex = useCallback((index: number) => {
    if (!tree) return
    if (index <= 0) {
      goToNode(null)
    } else {
      const clamped = Math.min(index, tree.mainLine.length)
      goToNode(tree.mainLine[clamped - 1])
    }
  }, [tree, goToNode])

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentNode) {
          goToNode(currentNode.parent?.san === '' ? null : currentNode.parent)
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!currentNode && tree) {
          goToNode(tree.mainLine[0] ?? null)
        } else if (currentNode?.children.length) {
          goToNode(currentNode.children[0])
        }
      }
      if (e.key === 'Home') {
        e.preventDefault()
        goToNode(null)
      }
      if (e.key === 'End') {
        e.preventDefault()
        if (tree && tree.mainLine.length > 0) {
          goToNode(tree.mainLine[tree.mainLine.length - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentNode, tree, goToNode])

  // -----------------------------------------------------------------------
  // Auto-fetch multi-PV when navigating in exploration mode
  // -----------------------------------------------------------------------
  // Clear multi-PV results when leaving exploration mode or navigating to a new position
  useEffect(() => {
    setMultiPvResults([])
    setMultiPvLoading(false)
  }, [currentNode, explorationMode])

  // -----------------------------------------------------------------------
  // Run full-game Stockfish analysis
  // -----------------------------------------------------------------------
  async function runAnalysis() {
    if (!tree) return
    setAnalyzing(true)
    setAnalysisError('')
    setEvaluations([])

    try {
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
        await engine.init()
      }

      const fens = [tree.root.fen, ...tree.mainLine.map(n => n.fen)]
      const sans = tree.mainLine.map(n => n.san)

      const depth = stockfishDepth ?? STOCKFISH_DEFAULTS.depth
      const results = await engine.analyzeGame(fens, sans, (progress) => {
        setAnalysisProgress(progress)
      }, depth)

      setEvaluations(results)

      // Attach evaluations to main-line nodes
      for (let i = 0; i < results.length; i++) {
        tree.mainLine[i].evaluation = results[i]
      }
      setTree({ ...tree })

      // Save evaluations to DB if we have a game ref and player
      if (gameRef && username) {
        try {
          await saveGameEvaluations(gameRef, username, results)
        } catch {
          // Non-critical — DB save failure doesn't block UI
        }
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  // -----------------------------------------------------------------------
  // Multi-PV: fetch alternative lines for a position
  // fen        — position to analyse (before the played move)
  // playedSan  — the move actually played from this position (may be empty)
  // -----------------------------------------------------------------------
  async function fetchMultiPv(fen: string, playedSan: string) {
    if (engineBusy.current) return
    engineBusy.current = true
    setMultiPvResults([])
    setMultiPvLoading(true)

    try {
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
        await engine.init()
      }

      const depth = stockfishDepth ?? STOCKFISH_DEFAULTS.depth
      const numLines = stockfishMultiPv ?? STOCKFISH_DEFAULTS.multiPv

      // Build set of legal UCI moves for this position so we can filter engine hallucinations
      const legalUcis = new Set<string>()
      try {
        const validator = new Chess(fen)
        for (const m of validator.moves({ verbose: true })) {
          legalUcis.add(m.from + m.to + (m.promotion ?? ''))
        }
      } catch { /* if FEN is invalid, skip validation */ }

      // Request one extra line so the played move has a chance of being included
      const results = await engine.evaluateMultiPV(fen, numLines + 1, depth)

      // Filter out any moves that are illegal in this position
      const legal = legalUcis.size > 0
        ? results.filter(r => !r.bestMoveUci || legalUcis.has(r.bestMoveUci))
        : results

      // Deduplicate by best move (engine can repeat when fewer distinct moves exist than requested)
      const seen = new Set<string>()
      const unique = legal.filter(r => {
        const key = r.bestMoveUci || r.bestMoveSan
        if (!key) return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const isWhiteToMove = fen.split(' ')[1] !== 'b'
      unique.sort((a, b) => isWhiteToMove ? b.cp - a.cp : a.cp - b.cp)

      let display: typeof unique
      if (playedSan) {
        const playedIdx = unique.findIndex(r => r.bestMoveSan === playedSan)
        if (playedIdx >= 0) {
          // Played move found — keep top (N-1) others + played move = N total
          const played = unique[playedIdx]
          const others = unique.filter((_, i) => i !== playedIdx).slice(0, numLines - 1)
          display = isWhiteToMove
            ? [...others, played].sort((a, b) => b.cp - a.cp)
            : [...others, played].sort((a, b) => a.cp - b.cp)
        } else {
          // Played move not in top N+1 — show top N engine lines only
          display = unique.slice(0, numLines)
        }
        display.forEach((r, i) => {
          r.rank = i + 1
          ;(r as any)._isActualMove = r.bestMoveSan === playedSan
        })
      } else {
        display = unique.slice(0, numLines)
        display.forEach((r, i) => { r.rank = i + 1 })
      }

      setMultiPvResults(display)
    } catch (err) {
      console.error('Multi-PV failed:', err)
      setMultiPvResults([])
    } finally {
      setMultiPvLoading(false)
      engineBusy.current = false
    }
  }

  // Trigger multi-PV when clicking a node in exploration mode
  function handleSelectNode(node: MoveNode) {
    // Stop deep analysis if running when navigating away
    if (deepAnalyzing) {
      engineRef.current?.stopAnalysis()
      setDeepAnalyzing(false)
    }
    goToNode(node)
  }

  // -----------------------------------------------------------------------
  // Deep (infinite) analysis of current position
  // -----------------------------------------------------------------------
  async function startDeepAnalysis() {
    const fen = currentNode?.fenBefore ?? tree?.root.fen
    if (!fen) return

    let engine = engineRef.current
    if (!engine) {
      engine = new StockfishEngine()
      engineRef.current = engine
      await engine.init()
      setDeepAnalyzing(true)
      setDeepAnalysisData(null)
      engine.startInfiniteAnalysis(
        fen,
        stockfishMultiPv ?? STOCKFISH_DEFAULTS.multiPv,
        (update) => setDeepAnalysisData(update)
      )
      return
    }

    setDeepAnalyzing(true)
    setDeepAnalysisData(null)
    engine.startInfiniteAnalysis(
      fen,
      stockfishMultiPv ?? STOCKFISH_DEFAULTS.multiPv,
      (update) => setDeepAnalysisData(update)
    )
  }

  function stopDeepAnalysis() {
    engineRef.current?.stopAnalysis()
    setDeepAnalyzing(false)
  }

  // -----------------------------------------------------------------------
  // Handle selecting an alternative PV line
  // -----------------------------------------------------------------------
  function handleSelectPvLine(line: MultiPvResult) {
    if (!tree) return

    // The multi-PV was computed for the position AFTER the current move (the board position)
    // So the branch attaches to the current node
    const parent = currentNode ?? tree.root

    const firstNode = addPvBranch(parent, line.lineSans)
    if (firstNode) {
      setTree({ ...tree })
      goToNode(firstNode)
    }
  }

  // -----------------------------------------------------------------------
  // Interactive board: handle piece drop
  // -----------------------------------------------------------------------
  function handlePieceDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!explorationMode || !tree) return false

    const g = new Chess(displayGame.current.fen())
    const piece = g.get(sourceSquare as Square)
    const isPromotion = piece?.type === 'p' &&
      ((piece.color === 'w' && targetSquare[1] === '8') ||
       (piece.color === 'b' && targetSquare[1] === '1'))
    const moveResult = g.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      ...(isPromotion && { promotion: 'q' })
    })

    if (!moveResult) return false

    // Determine parent: current node or root
    const parent = currentNode ?? tree.root

    const newNode = addBranch(
      parent,
      moveResult.san,
      moveResult.from,
      moveResult.to,
      g.fen()
    )

    setTree({ ...tree })
    goToNode(newNode)
    // Multi-PV auto-triggers via the currentNode effect

    return true
  }

  async function evaluateNodePosition(node: MoveNode) {
    try {
      let engine = engineRef.current
      if (!engine) {
        engine = new StockfishEngine()
        engineRef.current = engine
        await engine.init()
      }

      const result = await engine.evaluate(node.fen)

      // Determine cp from white's perspective
      const path = getPath(node)
      const ply = path.length - 1
      const isWhiteMove = ply % 2 === 0
      const cp = isWhiteMove ? -result.cp : result.cp

      // Also eval before to compute cpLoss
      const beforeResult = await engine.evaluate(node.fenBefore)
      const cpBefore = isWhiteMove ? beforeResult.cp : -beforeResult.cp
      const cpLoss = isWhiteMove
        ? Math.max(0, cpBefore - cp)
        : Math.max(0, cp - cpBefore)

      node.evaluation = {
        san: node.san,
        fen: node.fen,
        fenBefore: node.fenBefore,
        cp,
        cpBefore,
        bestMove: beforeResult.bestMove,
        bestMoveSan: '',
        bestLineSans: [],
        cpLoss,
        classification: cpLoss > 200 ? 'blunder' : cpLoss > 100 ? 'mistake' : cpLoss > 50 ? 'inaccuracy' : 'good',
        depth: 16
      }

      if (tree) setTree({ ...tree })
    } catch {
      // Silently fail for background eval
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup engine on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => { engineRef.current?.destroy() }
  }, [])

  // -----------------------------------------------------------------------
  // Save analysis
  // -----------------------------------------------------------------------
  async function handleSaveLine() {
    if (!currentNode || !tree) return
    setSaveMessage('')

    const path = getPath(currentNode)
    const pgn = path.map((n, i) => {
      const moveNum = Math.floor(i / 2) + 1
      return i % 2 === 0 ? `${moveNum}. ${n.san}` : n.san
    }).join(' ')

    try {
      await saveAnalysisLine({
        title: `Variation at move ${path.length}`,
        line_pgn: pgn,
        line_moves: path.map(n => ({ san: n.san, from: n.from, to: n.to, fen: n.fen })),
        starting_fen: tree.root.fen,
        starting_ply: 0
      })
      setSaveMessage('Line saved!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('Save failed')
    }
  }

  async function handleSaveTree() {
    if (!tree) return
    setSaveMessage('')

    // Serialize tree (strip circular parent refs)
    function serializeNode(node: MoveNode): any {
      return {
        id: node.id,
        san: node.san,
        from: node.from,
        to: node.to,
        fen: node.fen,
        fenBefore: node.fenBefore,
        evaluation: node.evaluation,
        isMainLine: node.isMainLine,
        children: node.children.map(serializeNode)
      }
    }

    const treeData = {
      root: serializeNode(tree.root),
      mainLineLength: tree.mainLine.length
    }

    try {
      await saveAnalysisTree({
        title: `Full analysis — ${new Date().toLocaleDateString()}`,
        tree_data: treeData
      })
      setSaveMessage('Full analysis saved!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('Save failed')
    }
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const currentEval = currentNode?.evaluation
  const onMainLine = isOnMainLine(currentNode)
  const mainLineIndex = tree && currentNode ? getMainLineIndex(currentNode, tree) : -1
  const totalMainMoves = tree?.mainLine.length ?? 0
  const sliderValue = onMainLine ? (mainLineIndex >= 0 ? mainLineIndex + 1 : 0) : 0

  // Current ply for move numbering
  const currentPly = currentNode ? getPath(currentNode).length : 0

  // Highlight squares
  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (currentNode) {
    const ev = currentNode.evaluation
    if (ev?.classification && ev.classification !== 'good') {
      customSquareStyles[currentNode.to] = {
        backgroundColor: CLASSIFICATION_SQUARE_COLORS[ev.classification] ?? 'transparent'
      }
    }
    if (!customSquareStyles[currentNode.from]) {
      customSquareStyles[currentNode.from] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' }
    }
    if (!customSquareStyles[currentNode.to]) {
      customSquareStyles[currentNode.to] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' }
    }
  }

  // Eval bar
  const evalCp = currentEval?.cp ?? 0
  const evalPercent = Math.max(2, Math.min(98, 50 + evalCp / 8))

  // Summary counts
  const blunders = evaluations.filter(e => e.classification === 'blunder').length
  const mistakes = evaluations.filter(e => e.classification === 'mistake').length
  const inaccuracies = evaluations.filter(e => e.classification === 'inaccuracy').length

  return (
    <div className='space-y-3'>
      {/* Header */}
      <MyBox>
        <div className='flex items-center justify-between'>
          <MyButton onClick={onBack} overrideClass='bg-gray-500 hover:bg-gray-600 text-xs'>
            {isFreeAnalysis ? 'Back' : 'Back to Games'}
          </MyButton>
          {isFreeAnalysis && (
            <span className='text-xs font-bold text-green-700'>Free Analysis</span>
          )}
        </div>
      </MyBox>

      <div className='grid grid-cols-1 gap-3 xl:grid-cols-[auto_1fr_1fr] xl:items-start'>
        {/* Column 1: Board */}
        <div className='space-y-1'>
          {/* Top player */}
          <div className='flex items-center justify-between rounded bg-gray-600 px-3 py-1.5 text-xs text-white'>
            <span className='font-bold'>
              {isFreeAnalysis ? 'Black' : (
                <>
                  {playerColor === 'white' ? game!.black.username : game!.white.username}
                  <span className='ml-1 font-normal text-blue-400'>
                    ({playerColor === 'white' ? game!.black.rating : game!.white.rating})
                  </span>
                </>
              )}
            </span>
            {!isFreeAnalysis && (
              <span className='text-red-400 font-bold'>{result === 'win' ? '0' : result === 'loss' ? '1' : '1/2'}</span>
            )}
          </div>

          {/* Board */}
          <div>
            <div>
              <Chessboard
                key={boardKey}
                position={displayGame.current.fen()}
                boardWidth={440}
                arePiecesDraggable={explorationMode}
                onPieceDrop={handlePieceDrop}
                boardOrientation={playerColor}
                customSquareStyles={customSquareStyles}
              />
            </div>
          </div>

          {/* Bottom player */}
          <div className='flex items-center justify-between rounded bg-green-50 border border-green-200 px-3 py-1.5 text-xs text-gray-900'>
            <span className='font-bold'>
              {isFreeAnalysis ? 'White' : (
                <>
                  {playerColor === 'white' ? game!.white.username : game!.black.username}
                  <span className='ml-1 font-normal text-blue-400'>
                    ({playerColor === 'white' ? game!.white.rating : game!.black.rating})
                  </span>
                </>
              )}
            </span>
            {!isFreeAnalysis && (
              <span className='text-red-600 font-bold'>{result === 'win' ? '1' : result === 'loss' ? '0' : '1/2'}</span>
            )}
          </div>

          {/* Branch indicator + save */}
          <div className='flex items-center gap-2'>
            {!onMainLine && (
              <>
                <span className='text-xs text-blue-600 font-bold'>Variation</span>
                <MyButton
                  onClick={() => {
                    if (currentNode) goToNode(findMainLineAncestor(currentNode))
                  }}
                  overrideClass='text-xs bg-blue-500 hover:bg-blue-600'
                >
                  Return to main line
                </MyButton>
              </>
            )}
            <div className='ml-auto flex items-center gap-2'>
              {currentNode && (
                <MyButton onClick={handleSaveLine} overrideClass='text-xxs bg-purple-500 hover:bg-purple-600'>
                  Save Line
                </MyButton>
              )}
              {saveMessage && (
                <span className='text-xxs text-green-600 font-bold'>{saveMessage}</span>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Moves */}
        <div className='xl:h-[520px] overflow-y-auto'>
          {tree && (
            <div className='h-full'>
              <div className='flex items-center justify-between border-b border-gray-200 pb-1 mb-2'>
                <h3 className='text-xs font-bold'>Moves</h3>
                {!isFreeAnalysis && (
                  <span className='text-xs text-gray-500'>
                    {opening || 'Unknown'}
                    {eco && <span className='text-gray-400 ml-1'>({eco})</span>}
                    <span className='ml-1 text-gray-400'>{game?.time_class}</span>
                  </span>
                )}
              </div>
              <MoveTree
                tree={tree}
                currentNode={currentNode}
                onSelectNode={handleSelectNode}
              />
            </div>
          )}
        </div>

        {/* Column 3: Analysis */}
        <div className='space-y-2'>
          {/* Stockfish settings */}
          <MyBox title='Stockfish'>
            <div className='space-y-2'>
              {/* Summary */}
              <div className='flex items-center justify-between'>
                {evaluations.length > 0 ? (
                  <div className='flex gap-2 text-xs'>
                    <span className='rounded bg-red-500 px-2 py-0.5 text-white'>{blunders} blunders</span>
                    <span className='rounded bg-orange-500 px-2 py-0.5 text-white'>{mistakes} mistakes</span>
                    <span className='rounded bg-yellow-400 px-2 py-0.5 text-black'>{inaccuracies} inaccuracies</span>
                  </div>
                ) : (
                  <span className='text-xs text-gray-400'>No analysis yet</span>
                )}
                <MyButton
                  onClick={() => setExplorationMode(!explorationMode)}
                  overrideClass={`text-xxs ${explorationMode ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-600'}`}
                >
                  {explorationMode ? 'Explore: ON' : 'Explore: OFF'}
                </MyButton>
              </div>

              {/* Settings */}
              <div className='flex items-center gap-4 border-t border-gray-200 pt-2'>
                <MySelect
                  label='Depth'
                  options={['10', '12', '14', '16', '18', '20', '22']}
                  value={String(stockfishDepth ?? STOCKFISH_DEFAULTS.depth)}
                  onChange={e => onStockfishDepthChange?.(parseInt(e.target.value, 10))}
                />
                <MySelect
                  label='Lines'
                  options={['1', '2', '3', '4', '5']}
                  value={String(stockfishMultiPv ?? STOCKFISH_DEFAULTS.multiPv)}
                  onChange={e => onStockfishMultiPvChange?.(parseInt(e.target.value, 10))}
                />
              </div>
              {!isFreeAnalysis && !analyzing && (
                <MyButton onClick={runAnalysis} overrideClass='w-full'>
                  {evaluations.length > 0 ? `Re-analyze all (depth ${stockfishDepth ?? STOCKFISH_DEFAULTS.depth})` : 'Analyze all moves'}
                </MyButton>
              )}

              {/* Deep analysis */}
              <div className='border-t border-gray-200 pt-2'>
                {!deepAnalyzing ? (
                  <MyButton onClick={startDeepAnalysis} overrideClass='w-full bg-purple-600 hover:bg-purple-700'>
                    Deep analyze this position
                  </MyButton>
                ) : (
                  <div className='space-y-1'>
                    <div className='flex items-center justify-between'>
                      <span className='text-xs font-bold text-purple-700'>
                        Depth: {deepAnalysisData?.depth ?? 0}
                      </span>
                      <MyButton onClick={stopDeepAnalysis} overrideClass='text-xxs bg-red-500 hover:bg-red-600'>
                        Stop
                      </MyButton>
                    </div>
                    {deepAnalysisData && (
                      <div className='text-xxs text-gray-500'>
                        {(deepAnalysisData.nodes / 1000000).toFixed(1)}M nodes
                        {' · '}
                        {(deepAnalysisData.nps / 1000).toFixed(0)}k nps
                        {' · '}
                        {(deepAnalysisData.timeMs / 1000).toFixed(1)}s
                      </div>
                    )}
                    {deepAnalysisData?.lines && deepAnalysisData.lines.length > 0 && (
                      <div className='space-y-0.5 mt-1'>
                        {deepAnalysisData.lines.map((line) => {
                          const cpColor = line.cp < 0 ? 'text-red-600' : 'text-gray-900'
                          const cpVal = Math.abs(line.cp) >= 10000
                            ? (line.cp > 0 ? `M${10000 - line.cp}` : `-M${10000 + line.cp}`)
                            : ((line.cp / 100).toFixed(1))
                          const cpDisplay = line.cp > 0 ? `+${cpVal}` : cpVal
                          return (
                            <div key={line.rank} className='flex items-start gap-1 text-xxs'>
                              <span className='text-gray-400 w-3'>{line.rank}.</span>
                              <span className={`font-mono font-bold w-8 ${cpColor}`}>{cpDisplay}</span>
                              <span className='font-bold'>{line.bestMoveSan}</span>
                              <span className='text-gray-500 truncate'>
                                {line.lineSans.slice(1).join(' ')}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </MyBox>

          {/* Progress */}
          {analyzing && (
            <MyBox title='Analyzing...'>
              <div className='space-y-2'>
                <div className='h-2 w-full overflow-hidden rounded bg-gray-200'>
                  <div
                    className='h-full bg-blue-500 transition-all duration-200'
                    style={{
                      width: `${analysisProgress.total > 0 ? (analysisProgress.current / analysisProgress.total) * 100 : 0}%`
                    }}
                  />
                </div>
                <p className='text-xs text-gray-600'>
                  Move {analysisProgress.current} / {analysisProgress.total}
                  {analysisProgress.move && ` — ${analysisProgress.move}`}
                </p>
              </div>
            </MyBox>
          )}

          {analysisError && (
            <MyBox>
              <p className='text-xs text-red-600'>{analysisError}</p>
              <MyButton onClick={runAnalysis} overrideClass='mt-2'>Retry</MyButton>
            </MyBox>
          )}

          {/* Engine lines */}
          {explorationMode && (
            <>
              {!multiPvLoading && multiPvResults.length === 0 && (
                <MyButton
                  onClick={() => {
                    // Analyse the position ON THE BOARD (after current move)
                    const fen = currentNode?.fen ?? tree?.root.fen
                    // Mark what was actually played next from this position
                    const played = currentNode?.children[0]?.san ?? ''
                    if (fen) fetchMultiPv(fen, played)
                  }}
                  overrideClass='w-full bg-blue-600 hover:bg-blue-700'
                >
                  Analyse Position
                </MyButton>
              )}
              {(multiPvLoading || multiPvResults.length > 0) && (
                <AlternativeLines
                  results={multiPvResults}
                  loading={multiPvLoading}
                  positionPly={currentPly}
                  onSelectLine={handleSelectPvLine}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

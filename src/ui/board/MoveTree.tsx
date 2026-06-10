'use client'

import { useEffect, useRef } from 'react'
import { AnalysisTree, MoveNode } from '@/src/lib/analysisTree'
import { MoveEvaluation } from '@/src/lib/stockfish'

interface MoveTreeProps {
  tree: AnalysisTree
  currentNode: MoveNode | null
  onSelectNode: (node: MoveNode) => void
}

const CLASSIFICATION_TEXT_COLORS: Record<string, string> = {
  blunder: 'text-red-600',
  mistake: 'text-orange-500',
  inaccuracy: 'text-yellow-600',
  good: 'text-blue-600'
}

function annotationSymbol(ev?: MoveEvaluation): string {
  if (!ev) return ''
  if (ev.classification === 'blunder') return '??'
  if (ev.classification === 'mistake') return '?'
  if (ev.classification === 'inaccuracy') return '?!'
  return ''
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10000) {
    return cp > 0 ? `M${10000 - cp}` : `-M${10000 + cp}`
  }
  const val = (cp / 100).toFixed(1)
  return cp > 0 ? `+${val}` : val
}

function evalColor(cp: number): string {
  if (cp < 0) return 'text-red-600'
  return 'text-gray-900'
}

function MoveBadge({
  node,
  isActive,
  onClick
}: {
  node: MoveNode
  isActive: boolean
  onClick: () => void
}) {
  const ev = node.evaluation
  const textColor = ev
    ? CLASSIFICATION_TEXT_COLORS[ev.classification]
    : node.isMainLine
      ? 'text-gray-700'
      : 'text-blue-600'

  const ann = annotationSymbol(ev)

  return (
    <button
      onClick={onClick}
      data-node-id={node.id}
      className={`inline-flex items-center gap-0.5 px-0.5 py-0.5 text-xs font-medium transition-all ${textColor} ${
        isActive ? 'bg-green-200 rounded' : ''
      }`}
    >
      <span>{node.san}</span>
      {ann && <span className='text-xxs text-blue-500'>{ann}</span>}
    </button>
  )
}

function EvalCell({ node }: { node?: MoveNode }) {
  if (!node?.evaluation) return <td className='py-0.5 pl-1'></td>
  const cp = node.evaluation.cp
  return (
    <td className={`py-0.5 pl-1 font-mono text-xxs ${evalColor(cp)}`}>
      {formatEval(cp)}
    </td>
  )
}

function InlineVariation({
  startNode,
  startPly,
  currentNode,
  onSelectNode
}: {
  startNode: MoveNode
  startPly: number
  currentNode: MoveNode | null
  onSelectNode: (node: MoveNode) => void
}) {
  const moves: { node: MoveNode; ply: number }[] = []
  let node: MoveNode | null = startNode
  let ply = startPly

  while (node) {
    moves.push({ node, ply })
    node = node.children.length > 0 ? node.children[0] : null
    ply++
  }

  return (
    <div className='ml-4 my-0.5 flex flex-wrap items-center gap-0.5 rounded bg-gray-50 px-1.5 py-0.5 border-l-2 border-blue-300'>
      {moves.map(({ node: n, ply: p }) => {
        const moveNum = Math.floor(p / 2) + 1
        const isWhite = p % 2 === 0

        return (
          <span key={n.id} className='inline-flex items-center gap-0.5'>
            {isWhite && (
              <span className='text-xxs text-gray-400 font-mono'>{moveNum}.</span>
            )}
            {!isWhite && p === startPly && (
              <span className='text-xxs text-gray-400 font-mono'>{moveNum}...</span>
            )}
            <MoveBadge
              node={n}
              isActive={currentNode?.id === n.id}
              onClick={() => onSelectNode(n)}
            />
            {n.evaluation && (
              <span className={`text-xxs font-mono ${evalColor(n.evaluation.cp)}`}>
                {formatEval(n.evaluation.cp)}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export default function MoveTree({ tree, currentNode, onSelectNode }: MoveTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && currentNode) {
      const active = containerRef.current.querySelector(`[data-node-id="${currentNode.id}"]`)
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentNode])

  const mainLine = tree.mainLine
  const rows: React.ReactNode[] = []

  for (let i = 0; i < mainLine.length; i += 2) {
    const whiteNode = mainLine[i]
    const blackNode = i + 1 < mainLine.length ? mainLine[i + 1] : null
    const moveNum = Math.floor(i / 2) + 1

    rows.push(
      <tr key={`main-${i}`} className='border-b border-gray-50'>
        <td className='py-0.5 pr-1 text-gray-400 font-mono text-xs w-8'>{moveNum}.</td>
        <td className='py-0.5'>
          <MoveBadge
            node={whiteNode}
            isActive={currentNode?.id === whiteNode.id}
            onClick={() => onSelectNode(whiteNode)}
          />
        </td>
        <EvalCell node={whiteNode} />
        <td className='py-0.5'>
          {blackNode && (
            <MoveBadge
              node={blackNode}
              isActive={currentNode?.id === blackNode.id}
              onClick={() => onSelectNode(blackNode)}
            />
          )}
        </td>
        <EvalCell node={blackNode ?? undefined} />
      </tr>
    )

    // White variations
    const whiteParent = whiteNode.parent
    if (whiteParent && whiteParent.children.length > 1) {
      const branches = whiteParent.children.filter(c => c.id !== whiteNode.id)
      for (const branch of branches) {
        rows.push(
          <tr key={`var-w-${branch.id}`}>
            <td colSpan={5} className='py-0'>
              <InlineVariation
                startNode={branch}
                startPly={i}
                currentNode={currentNode}
                onSelectNode={onSelectNode}
              />
            </td>
          </tr>
        )
      }
    }

    // Black variations
    if (blackNode && whiteNode.children.length > 1) {
      const branches = whiteNode.children.filter(c => c.id !== blackNode.id)
      for (const branch of branches) {
        rows.push(
          <tr key={`var-b-${branch.id}`}>
            <td colSpan={5} className='py-0'>
              <InlineVariation
                startNode={branch}
                startPly={i + 1}
                currentNode={currentNode}
                onSelectNode={onSelectNode}
              />
            </td>
          </tr>
        )
      }
    }
  }

  return (
    <div ref={containerRef} className='overflow-y-auto'>
      <table className='w-full text-xs'>
        <thead>
          <tr className='border-b border-gray-200 text-gray-400'>
            <th className='w-8 pb-1 text-left'>#</th>
            <th className='pb-1 text-left'>White</th>
            <th className='pb-1 text-left pl-1'>Eval</th>
            <th className='pb-1 text-left'>Black</th>
            <th className='pb-1 text-left pl-1'>Eval</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

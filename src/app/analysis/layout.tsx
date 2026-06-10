'use client'

import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Habits',   href: '/analysis/habits'    },
  { label: 'Quiz',     href: '/analysis/quiz'       },
  { label: 'Briefing', href: '/analysis/briefing'   },
  { label: 'Stockfish', href: '/analysis/enrich'      },
]

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <div className='border-b border-gray-200 mb-6'>
        <nav className='-mb-px flex gap-1'>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <a
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </a>
            )
          })}
        </nav>
      </div>
      {children}
    </div>
  )
}

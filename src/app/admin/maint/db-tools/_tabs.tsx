'use client'

import dynamic from 'next/dynamic'

const DatabaseTools = dynamic(() => import('nextjs-shared/DatabaseTools'), { ssr: false })

export default function DbToolsTabs({ tables, baseDir }: { tables: string[]; baseDir: string }) {
  return <DatabaseTools tables={tables} baseDir={baseDir} />
}

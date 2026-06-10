'use client'
import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative left-1/2 w-screen -translate-x-1/2 -my-6'>
      <Suspense>
        {children}
      </Suspense>
    </div>
  )
}

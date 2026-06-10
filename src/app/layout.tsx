import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'Chess Game Analyzer',
  description: 'Analyze your chess.com games with Stockfish'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const DB_LOCATION = process.env.POSTGRES_DATABASE_LOCATION ?? 'unknown'
  const IS_DEV = process.env.NEXT_PUBLIC_APPENV_ISDEV === 'true'

  return (
    <html
      lang='en'
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='min-h-full flex flex-col bg-background text-foreground'>
        {IS_DEV && (
          <div className='fixed top-2 right-2 z-50 rounded bg-yellow-200 px-2 py-0.5 text-xxs font-bold text-yellow-800 opacity-70'>
            {DB_LOCATION}
          </div>
        )}
        <header className='border-b border-gray-200 bg-white'>
          <div className='flex items-center px-4 py-3 gap-8'>
            <h1 className='text-lg font-bold text-gray-900 shrink-0'>Chess Analyzer</h1>
            <nav className='flex items-center gap-6 text-sm'>
              <a href='/' className='text-gray-600 hover:text-gray-900'>Dashboard</a>
              <a href='/analysis/habits' className='text-gray-600 hover:text-gray-900'>Analysis</a>
              {IS_DEV && (
                <a href='/owner' className='text-gray-600 hover:text-gray-900'>Owner</a>
              )}
            </nav>
          </div>
        </header>
        <main className='w-full flex-1 px-4 py-6'>
          {children}
        </main>
      </body>
    </html>
  )
}

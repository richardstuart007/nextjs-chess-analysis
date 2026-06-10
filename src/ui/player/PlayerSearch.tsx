'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MyBox from 'nextjs-shared/MyBox'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { DEFAULT_PLAYER } from '@/src/lib/constants'

interface PlayerSearchProps {
  onSearch: (username: string) => void
  loading: boolean
  error: string
}

export default function PlayerSearch({ onSearch, loading, error }: PlayerSearchProps) {
  const [username, setUsername] = useState(DEFAULT_PLAYER)

  function handleSubmit() {
    const trimmed = username.trim()
    if (!trimmed) return
    onSearch(trimmed)
  }

  return (
    <MyBox title='Player Search'>
      <div className='flex items-end gap-2'>
        <div>
          <label htmlFor='username' className='mb-1 block text-xs text-gray-700'>
            Chess.com Username
          </label>
          <MyInput
            id='username'
            type='text'
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder='Enter chess.com username'
            overrideClass='w-64'
          />
        </div>
        <MyButton onClick={handleSubmit} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </MyButton>
      </div>

      {error && <p className='mt-2 text-xs text-red-600'>{error}</p>}
      {loading && <MyLoadingMessage message1='Loading player...' />}
    </MyBox>
  )
}

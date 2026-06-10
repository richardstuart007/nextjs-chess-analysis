'use client'

import MyBox from 'nextjs-shared/MyBox'

interface PlayerProfileProps {
  username: string
  displayName?: string
  avatar?: string
  ratings?: Record<string, number>
  onClick?: () => void
  selected?: boolean
}

export default function PlayerProfile({
  username,
  displayName,
  avatar,
  ratings,
  onClick,
  selected
}: PlayerProfileProps) {
  return (
    <MyBox>
      <div
        className={`flex items-start gap-4 rounded ${onClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${selected ? 'outline outline-2 outline-blue-400 rounded' : ''}`}
        onClick={onClick}
      >
        {avatar && (
          <img
            src={avatar}
            alt={username}
            className='h-16 w-16 rounded-full'
          />
        )}
        <div className='flex-1'>
          {displayName && (
            <h2 className='text-sm font-bold'>{displayName}</h2>
          )}
          <p className='text-xs text-gray-500'>{username}</p>

          {ratings && Object.keys(ratings).length > 0 && (
            <div className='mt-2 flex flex-wrap gap-2'>
              {Object.entries(ratings).map(([control, rating]) => (
                <span
                  key={control}
                  className='rounded bg-gray-100 px-2 py-0.5 text-xs'
                >
                  {control}: {rating}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </MyBox>
  )
}

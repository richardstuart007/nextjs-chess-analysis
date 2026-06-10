import { redirect } from 'next/navigation'

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_APPENV_ISDEV !== 'true') redirect('/')

  return (
    <div>
      <nav className='flex gap-6 mb-4 pb-2 border-b border-gray-200 text-sm'>
        <a href='/owner/cron' className='text-gray-600 hover:text-gray-900'>Cron</a>
        <a href='/owner/maintenance' className='text-gray-600 hover:text-gray-900'>Maintenance</a>
        <a href='/owner/pipeline' className='text-gray-600 hover:text-gray-900'>Pipeline</a>
        <a href='/owner/admin/maint/db-tools' className='text-gray-600 hover:text-gray-900'>DB Tools</a>
        <a href='/owner/admin/maint/copytable' className='text-gray-600 hover:text-gray-900'>Copy Table</a>
      </nav>
      {children}
    </div>
  )
}

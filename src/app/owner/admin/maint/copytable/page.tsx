export const dynamic = 'force-dynamic'
import CopyTable from 'nextjs-shared/CopyTable'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div className='w-full md:p-6'>
      <Suspense>
        <CopyTable baseDir='C:/Users/richa/github/nextjs-chess' caller='admin/maint/copytable' />
      </Suspense>
    </div>
  )
}

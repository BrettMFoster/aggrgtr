'use client'
import { SWRConfig } from 'swr'

export function Providers({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher: (url) => fetch(url).then(res => res.json()),
        revalidateOnFocus: false,      // Don't refetch when window regains focus
        revalidateIfStale: true,       // Revalidate stale data in background
        dedupingInterval: 60000,       // Dedupe requests within 1 minute
      }}
    >
      {children}
    </SWRConfig>
  )
}

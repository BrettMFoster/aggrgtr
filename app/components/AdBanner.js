'use client'

import { useEffect, useState } from 'react'

export default function AdBanner() {
  const [adLoaded, setAdLoaded] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only push ads on production domain
    if (window.location.hostname === 'localhost') return

    const timer = setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({})
        setAdLoaded(true)
      } catch (e) {
        // AdSense not loaded
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ width: '100%', maxWidth: '728px', margin: '24px auto', textAlign: 'center' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-5708927690150651"
        data-ad-slot="auto"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

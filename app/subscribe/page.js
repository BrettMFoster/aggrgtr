'use client'
import { useState, useEffect } from 'react'

export default function SubscribePage() {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState('subscribe') // 'subscribe' or 'unsubscribe'
  const [status, setStatus] = useState(null) // 'success', 'error', or null
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus(null)
    setMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/subscribe', {
        method: mode === 'subscribe' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Something went wrong')
      } else {
        setStatus('success')
        setMessage(mode === 'subscribe'
          ? 'Subscribed! You\'ll receive updates when new datasets are available.'
          : 'Unsubscribed. You won\'t receive any more emails from us.')
        setEmail('')
      }
    } catch (err) {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: '24px' }}>
          <a href="https://github.com" style={{ color: '#fff', textDecoration: 'none' }} target="_blank" rel="noopener">GitHub</a>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: isMobile ? '40px 16px' : '80px 32px' }}>
        <h1 style={{ fontSize: isMobile ? '24px' : '32px', fontWeight: '600', marginBottom: '12px', color: '#fff' }}>
          {mode === 'subscribe' ? 'Get Updates' : 'Unsubscribe'}
        </h1>
        <p style={{ fontSize: '16px', color: '#999', marginBottom: '32px', lineHeight: '1.6' }}>
          {mode === 'subscribe'
            ? 'Get notified when new datasets are available or when we launch API access.'
            : 'Enter your email to stop receiving updates.'}
        </p>

        {/* Toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={() => { setMode('subscribe'); setStatus(null); setMessage(''); }}
            style={{
              background: mode === 'subscribe' ? '#1a1a1a' : 'transparent',
              border: mode === 'subscribe' ? '1px solid #333' : '1px solid #222',
              color: mode === 'subscribe' ? '#fff' : '#666',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: mode === 'subscribe' ? '500' : '400'
            }}
          >
            Subscribe
          </button>
          <button
            onClick={() => { setMode('unsubscribe'); setStatus(null); setMessage(''); }}
            style={{
              background: mode === 'unsubscribe' ? '#1a1a1a' : 'transparent',
              border: mode === 'unsubscribe' ? '1px solid #333' : '1px solid #222',
              color: mode === 'unsubscribe' ? '#fff' : '#666',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: mode === 'unsubscribe' ? '500' : '400'
            }}
          >
            Unsubscribe
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#999', marginBottom: '8px' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '16px',
                border: '1px solid #333',
                borderRadius: '6px',
                background: '#111',
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: mode === 'subscribe' ? '#fff' : '#333',
              color: mode === 'subscribe' ? '#0a0a0a' : '#fff',
              padding: '12px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Processing...' : (mode === 'subscribe' ? 'Subscribe' : 'Unsubscribe')}
          </button>
        </form>

        {/* Status message */}
        {status && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '6px',
            background: status === 'success' ? '#052e16' : '#2a1215',
            border: status === 'success' ? '1px solid #166534' : '1px solid #7f1d1d',
            color: status === 'success' ? '#4ade80' : '#f87171',
            fontSize: '14px'
          }}>
            {message}
          </div>
        )}

        {/* Back link */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: '14px' }}>
            ← Back to datasets
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #222', padding: isMobile ? '16px' : '24px 32px', fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#666', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2025 — Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
let listeners: Listener[] = []

function notify() {
  listeners.forEach((fn) => fn([...toasts]))
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  toasts = [...toasts, { id, message, type }]
  notify()

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, 3200)
}

showToast.success = (msg: string) => showToast(msg, 'success')
showToast.error = (msg: string) => showToast(msg, 'error')
showToast.warning = (msg: string) => showToast(msg, 'warning')
showToast.info = (msg: string) => showToast(msg, 'info')

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    listeners.push(setItems)
    return () => {
      listeners = listeners.filter((fn) => fn !== setItems)
    }
  }, [])

  if (items.length === 0) return null

  const typeStyles: Record<ToastType, { bg: string; icon: string; border: string }> = {
    success: { bg: '#e6fffa', icon: '✅', border: '#00e07f' },
    error: { bg: '#ffebee', icon: '🚨', border: '#ff5a5a' },
    warning: { bg: '#fffbe6', icon: '⚠️', border: '#ffe14d' },
    info: { bg: '#e6f7ff', icon: '💡', border: '#6cb8ff' },
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
    >
      {items.map((item) => {
        const s = typeStyles[item.type]
        return (
          <div
            key={item.id}
            style={{
              pointerEvents: 'auto',
              background: s.bg,
              border: '3px solid #111',
              borderRadius: 12,
              padding: '12px 18px',
              boxShadow: '4px 4px 0 #111',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              maxWidth: 360,
              fontWeight: 800,
              fontSize: 14,
              color: '#111',
              animation: 'popIn 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <span style={{ fontSize: 18 }}>{s.icon}</span>
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{item.message}</span>
            <button
              onClick={() => {
                toasts = toasts.filter((t) => t.id !== item.id)
                notify()
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 900,
                color: '#666',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

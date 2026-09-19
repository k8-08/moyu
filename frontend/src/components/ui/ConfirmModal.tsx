import { useEffect } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'danger' | 'primary' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title = '⚠️ 操作确认',
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const getConfirmBtnBg = () => {
    switch (confirmVariant) {
      case 'danger':
        return '#ff5a5a'
      case 'warning':
        return 'var(--yellow)'
      default:
        return 'var(--green)'
    }
  }

  return (
    <div className="moyu-modal-backdrop" onClick={onCancel} style={{ zIndex: 10000 }}>
      <div
        className="moyu-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, textAlign: 'center', padding: '24px 20px' }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {confirmVariant === 'danger' ? '🗑️' : confirmVariant === 'warning' ? '⚠️' : '💡'}
        </div>
        <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 900 }}>{title}</h3>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#444', lineHeight: 1.5, margin: '0 0 20px', whiteSpace: 'pre-wrap' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: '3px solid var(--black)',
              background: '#f0f0f0',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--black)',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: '3px solid var(--black)',
              background: getConfirmBtnBg(),
              fontWeight: 900,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--black)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

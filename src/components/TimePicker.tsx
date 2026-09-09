import { useEffect, useRef, useState } from 'react'

interface TimePickerProps {
  value: string // 格式如 "09:00"
  onChange: (val: string) => void
  placeholder?: string
  presetType?: 'start' | 'end' | 'lunch' | 'general'
}

const PRESETS: Record<string, string[]> = {
  start: ['08:00', '08:30', '09:00', '09:30', '10:00'],
  end: ['17:30', '18:00', '18:30', '19:00', '20:00'],
  lunch: ['12:00', '12:30', '13:00', '13:30', '14:00'],
  general: ['09:00', '12:00', '13:00', '18:00'],
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function TimePicker({
  value,
  onChange,
  presetType = 'general',
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [currentH, currentM] = (value || '09:00').split(':')
  const hour = currentH || '09'
  const minute = currentM || '00'

  // 点击外部收起
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${minute}`)
  }

  const handleSelectMinute = (m: string) => {
    onChange(`${hour}:${m}`)
  }

  const handleSelectPreset = (preset: string) => {
    onChange(preset)
    setOpen(false)
  }

  const presets = PRESETS[presetType] || PRESETS.general

  return (
    <div className="timepicker-container" ref={containerRef}>
      {/* 触发按钮/输入框 */}
      <button
        type="button"
        className={`timepicker-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="tp-text">{value || '09:00'}</span>
        <span className="tp-icon">⏰</span>
      </button>

      {/* 展开浮层 */}
      {open && (
        <div className="timepicker-dropdown">
          {/* 快捷推荐标签 */}
          <div className="tp-presets-bar">
            <span className="tp-preset-tip">快捷：</span>
            {presets.map((p) => (
              <button
                type="button"
                key={p}
                className={`tp-preset-chip ${p === value ? 'active' : ''}`}
                onClick={() => handleSelectPreset(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* 时与分双列选择面板 */}
          <div className="tp-columns-wrap">
            {/* 小时列 */}
            <div className="tp-column">
              <div className="tp-column-title">时</div>
              <div className="tp-scroll-list">
                {HOURS.map((h) => {
                  const isSelected = h === hour
                  return (
                    <button
                      type="button"
                      key={h}
                      className={`tp-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectHour(h)}
                    >
                      {h}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 冒号分隔 */}
            <div className="tp-colon">:</div>

            {/* 分钟列 */}
            <div className="tp-column">
              <div className="tp-column-title">分</div>
              <div className="tp-scroll-list">
                {MINUTES.map((m) => {
                  const isSelected = m === minute
                  return (
                    <button
                      type="button"
                      key={m}
                      className={`tp-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectMinute(m)}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 底部关闭栏 */}
          <div className="tp-footer">
            <span className="tp-preview-text">当前设定：{hour}:{minute}</span>
            <button
              type="button"
              className="tp-confirm-btn"
              onClick={() => setOpen(false)}
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { type ActiveSlack, DEFAULT_SETTINGS, type MoyuSettings, type SlackRecord } from './moyuTypes'

const SETTINGS_KEY = 'moyu_settings_v2'
const RECORDS_KEY = 'moyu_records_v2'
const ACTIVE_SLACK_KEY = 'moyu_active_slack_v2'
const DATE_KEY = 'moyu_records_date_v2'

export function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadSettingsFromStorage(): MoyuSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    }
    // 兼容旧版本的单个字段
    const oldSalary = localStorage.getItem('moyu-salary')
    const oldDays = localStorage.getItem('moyu-days')
    return {
      ...DEFAULT_SETTINGS,
      ...(oldSalary ? { salary: oldSalary } : {}),
      ...(oldDays ? { workDays: oldDays } : {}),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettingsToStorage(settings: MoyuSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings', e)
  }
}

export function loadRecordsFromStorage(): SlackRecord[] {
  try {
    const savedDate = localStorage.getItem(DATE_KEY)
    const today = getTodayStr()
    if (savedDate !== today) {
      return []
    }
    const raw = localStorage.getItem(RECORDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRecordsToStorage(records: SlackRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
    localStorage.setItem(DATE_KEY, getTodayStr())
  } catch (e) {
    console.error('Failed to save records', e)
  }
}

export function loadActiveSlackFromStorage(): ActiveSlack | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SLACK_KEY)
    if (!raw) return null
    const active: ActiveSlack = JSON.parse(raw)
    if (active.date !== getTodayStr()) {
      localStorage.removeItem(ACTIVE_SLACK_KEY)
      return null
    }
    return active
  } catch {
    return null
  }
}

export function saveActiveSlackToStorage(active: ActiveSlack | null): void {
  try {
    if (active) {
      localStorage.setItem(ACTIVE_SLACK_KEY, JSON.stringify(active))
    } else {
      localStorage.removeItem(ACTIVE_SLACK_KEY)
    }
  } catch (e) {
    console.error('Failed to save active slack', e)
  }
}

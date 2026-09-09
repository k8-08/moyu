// API 客户端与后端接口封装

const API_BASE = 'http://localhost:8080/api'

// 获取或生成设备 ID (30天持久免密)
export const getDeviceId = (): string => {
  let id = localStorage.getItem('moyu_device_id')
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36)
    localStorage.setItem('moyu_device_id', id)
  }
  return id
}

export interface UserInfo {
  id: number
  username: string
  nickname: string
  role: 'user' | 'admin'
  device_id?: string
  created_at?: string
}

export interface UserProfile {
  id: number
  user_id: number
  salary: number
  work_days: number
  work_start: string
  work_end: string
  lunch_start: string
  lunch_end: string
}

export interface DailySalaryRecord {
  id: number
  user_id: number
  date: string
  year: number
  month: number
  week: number
  day: number
  base_salary: number
  slack_salary: number
  total_salary: number
  slack_count: number
  slack_duration: number
  updated_at?: string
  user_nickname?: string
  user_username?: string
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('moyu_token')
  const deviceId = getDeviceId()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    ...((options.headers as Record<string, string>) || {}),
  }

  if (token) {
    headers['Authorization'] = 'Bearer ' + token
  }

  const url = path.startsWith('http') ? path : API_BASE + path

  const res = await fetch(url, {
    ...options,
    headers,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const msg = data?.detail || data?.message || '请求失败 (' + res.status + ')'
    throw new Error(msg)
  }

  return data as T
}

// 认证接口
export const authApi = {
  // 获取图形验证码
  getCaptcha: () => request<{ captcha_id: string; image: string }>('/auth/captcha'),

  // 注册账号
  register: (body: { username: string; nickname: string; password: string; confirm_password?: string; captcha_id: string; captcha_code: string }) =>
    request<{ access_token: string; user: UserInfo }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...body, device_id: getDeviceId() }),
    }),

  // 账号登录
  login: (body: { username: string; password: string }) =>
    request<{ access_token: string; user: UserInfo }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...body, device_id: getDeviceId() }),
    }),

  // 获取当前用户
  getMe: () => request<UserInfo>('/auth/me'),

  // 退出登录
  logout: () => {
    localStorage.removeItem('moyu_token')
    localStorage.removeItem('moyu_user')
  },
}

// 打工档案接口
export const profileApi = {
  get: () => request<UserProfile>('/profile'),
  update: (body: Partial<UserProfile>) =>
    request<UserProfile>('/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}

// 摸鱼流水接口
export const recordsApi = {
  getToday: () => request<any[]>('/records?date_str='),
  create: (body: { id: string; category_id: string; start_time: number; end_time: number; duration: number; earned: number }) =>
    request<any>('/records', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    request<any>('/records/' + encodeURIComponent(id), {
      method: 'DELETE',
    }),
}

// 工资表快照接口
export const salaryApi = {
  reportToday: (body: { date?: string; base_salary: number; slack_salary: number; total_salary: number; slack_count: number; slack_duration: number }) =>
    request<DailySalaryRecord>('/salary/report', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getHistory: (rangeType: 'day' | 'week' | 'month' | 'year' | 'all' = 'all') =>
    request<DailySalaryRecord[]>('/salary/history?range_type=' + rangeType),
}

// 后台管理接口
export const adminApi = {
  getStats: (dimension: 'day' | 'week' | 'month' | 'year' | 'all' = 'all') =>
    request<{
      dimension: string
      total_base_salary: number
      total_slack_salary: number
      total_salary: number
      total_slack_count: number
      total_slack_duration: number
      users_count: number
      salaries_count: number
      category_stats: { category_id: string; count: number; total_duration: number; total_earned: number }[]
      hero_rankings: { user_id: number; nickname: string; username: string; total_slack_salary: number; total_slack_duration: number }[]
    }>('/admin/stats?dimension=' + dimension),

  getUsers: () =>
    request<
      {
        id: number
        username: string
        nickname: string
        role: string
        device_id?: string
        created_at?: string
        profile?: UserProfile
      }[]
    >('/admin/users'),

  getSalaries: (params?: { user_id?: number; date?: string; year?: number; month?: number; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.user_id) q.set('user_id', String(params.user_id))
    if (params?.date) q.set('date', params.date)
    if (params?.year) q.set('year', String(params.year))
    if (params?.month) q.set('month', String(params.month))
    if (params?.limit) q.set('limit', String(params.limit))
    return request<DailySalaryRecord[]>('/admin/salaries?' + q.toString())
  },
}
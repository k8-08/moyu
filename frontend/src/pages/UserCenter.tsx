import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import '../App.css'
import { authApi, profileApi, recordsApi, salaryApi, type UserInfo } from '../api/client'
import {
  type MoyuSettings,
  SLACK_CATEGORIES,
  fmtDuration,
  fmtMoney,
  getRates,
} from '../lib/moyuTypes'
import { loadRecordsFromStorage, loadSettingsFromStorage } from '../lib/moyuStorage'

type TimeDimension = 'day' | 'week' | 'month' | 'year' | 'all'

export default function UserCenter() {
  const navigate = useNavigate()

  // 1. 用户档案与基础配置
  const [user, setUser] = useState<UserInfo | null>(null)
  const [settings, setSettings] = useState<MoyuSettings>(loadSettingsFromStorage)
  const [loading, setLoading] = useState(true)

  // 2. 核心数据源
  const [salariesList, setSalariesList] = useState<any[]>([])
  const [allRecords, setAllRecords] = useState<any[]>([])
  const [dimension, setDimension] = useState<TimeDimension>('month')

  // 3. 日历状态
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // 日期辅助：获取今天与昨天日期字符串
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const yesterdayStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // 计算费率
  const rates = useMemo(() => getRates(settings), [settings])

  // 4. 数据加载
  const loadUserData = useCallback(async () => {
    const token = localStorage.getItem('moyu_token')
    if (!token) {
      navigate('/login')
      return
    }

    try {
      setLoading(true)
      const me = await authApi.getMe()
      setUser(me)

      const p = await profileApi.get()
      if (p && p.salary) {
        setSettings({
          salary: String(p.salary),
          workDays: String(p.work_days),
          workStart: p.work_start,
          workEnd: p.work_end,
          lunchStart: p.lunch_start,
          lunchEnd: p.lunch_end,
        })
      }

      // 获取当前打工人的历史每日工资快照
      const history = await salaryApi.getMyHistory({ limit: 365 })
      let currentSalaries = history || []

      // 若今天的快照出勤底薪与最新档案不一致（例如刚刚修改过月薪），自动校准并刷新云端
      const curDailyBase = rates.perDay
      const todayRecord = currentSalaries.find((s) => s.date === todayStr)
      if (todayRecord && Math.abs(Number(todayRecord.base_salary) - curDailyBase) > 0.05) {
        salaryApi.reportToday({
          date: todayStr,
          base_salary: curDailyBase,
          slack_salary: Number(todayRecord.slack_salary || 0),
          total_salary: Number((curDailyBase + Number(todayRecord.slack_salary || 0)).toFixed(2)),
          slack_count: todayRecord.slack_count,
          slack_duration: todayRecord.slack_duration,
        }).then((updated) => {
          setSalariesList((prev) => prev.map((item) => (item.date === todayStr ? updated : item)))
        }).catch(() => {})
      }

      setSalariesList(currentSalaries)

      // 获取云端摸鱼流水
      const recs = await recordsApi.listAll()
      if (recs && Array.isArray(recs)) {
        setAllRecords(recs)
      } else {
        setAllRecords(loadRecordsFromStorage())
      }
    } catch (e) {
      console.error('Failed to load user center data', e)
    } finally {
      setLoading(false)
    }
  }, [navigate, rates.perDay, todayStr])

  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // 5. 退出登录
  const handleLogout = () => {
    authApi.logout()
    navigate('/login')
  }

  // 6. 查找指定日期的工资快照与摸鱼流水
  const getSalaryByDate = useCallback(
    (dateStr: string) => {
      const match = salariesList.find((s) => s.date === dateStr)

      // 如果是今天，出勤底薪严格以当前档案标准日薪 rates.perDay 为准，避免旧快照锁住
      if (dateStr === todayStr) {
        const dailyBase = rates.perDay
        const dayRecs = allRecords.filter((r) => {
          const dStr = r.created_at
            ? r.created_at.slice(0, 10)
            : new Date(r.start_time || r.startTime).toISOString().slice(0, 10)
          return dStr === dateStr
        })
        const sumSlack = match ? Number(match.slack_salary) : dayRecs.reduce((s, r) => s + (r.earned || 0), 0)
        const sumDur = match ? match.slack_duration : dayRecs.reduce((s, r) => s + (r.duration || 0), 0)
        const count = match ? match.slack_count : dayRecs.length

        return {
          date: dateStr,
          base_salary: dailyBase,
          slack_salary: sumSlack,
          total_salary: Number((dailyBase + sumSlack).toFixed(2)),
          slack_count: count,
          slack_duration: sumDur,
        }
      }

      if (match) return match

      // 如果后端快照暂未落库，基于摸鱼流水与档案计算
      const dayRecs = allRecords.filter((r) => {
        const dStr = r.created_at
          ? r.created_at.slice(0, 10)
          : new Date(r.start_time || r.startTime).toISOString().slice(0, 10)
        return dStr === dateStr
      })
      const sumSlack = dayRecs.reduce((s, r) => s + (r.earned || 0), 0)
      const sumDur = dayRecs.reduce((s, r) => s + (r.duration || 0), 0)
      const dailyBase = rates.perDay

      return {
        date: dateStr,
        base_salary: dailyBase,
        slack_salary: sumSlack,
        total_salary: dailyBase + sumSlack,
        slack_count: dayRecs.length,
        slack_duration: sumDur,
      }
    },
    [salariesList, allRecords, rates, todayStr]
  )

  const getRecordsByDate = useCallback(
    (dateStr: string) => {
      return allRecords.filter((r) => {
        const dStr = r.created_at
          ? r.created_at.slice(0, 10)
          : new Date(r.start_time || r.startTime).toISOString().slice(0, 10)
        return dStr === dateStr
      })
    },
    [allRecords]
  )

  // 昨天与今天数据
  const yesterdaySalary = useMemo(() => getSalaryByDate(yesterdayStr), [getSalaryByDate, yesterdayStr])
  const yesterdayRecords = useMemo(() => getRecordsByDate(yesterdayStr), [getRecordsByDate, yesterdayStr])

  const todaySalary = useMemo(() => getSalaryByDate(todayStr), [getSalaryByDate, todayStr])
  const todayRecords = useMemo(() => getRecordsByDate(todayStr), [getRecordsByDate, todayStr])

  // 选中日期的数据
  const selectedSalary = useMemo(() => getSalaryByDate(selectedDate), [getSalaryByDate, selectedDate])
  const selectedRecords = useMemo(() => getRecordsByDate(selectedDate), [getRecordsByDate, selectedDate])

  // 7. 多维时间段战报统计（日 / 周 / 月 / 年 / 全部）
  const statsSummary = useMemo(() => {
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1

    // 计算当前周周一日期
    const monday = new Date(now)
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1))
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

    let filtered = salariesList
    if (dimension === 'day') {
      filtered = salariesList.filter((s) => s.date === todayStr)
      if (filtered.length === 0 && todaySalary) filtered = [todaySalary]
    } else if (dimension === 'week') {
      filtered = salariesList.filter((s) => s.date >= mondayStr && s.date <= todayStr)
    } else if (dimension === 'month') {
      filtered = salariesList.filter((s) => s.year === curYear && s.month === curMonth)
    } else if (dimension === 'year') {
      filtered = salariesList.filter((s) => s.year === curYear)
    }

    const baseSum = filtered.reduce((sum, s) => {
      const b = s.date === todayStr ? rates.perDay : (Number(s.base_salary) || 0)
      return sum + b
    }, 0)
    const slackSum = filtered.reduce((sum, s) => sum + (Number(s.slack_salary) || 0), 0)
    const totalSum = Number((baseSum + slackSum).toFixed(2))
    const countSum = filtered.reduce((sum, s) => sum + (Number(s.slack_count) || 0), 0)
    const durSum = filtered.reduce((sum, s) => sum + (Number(s.slack_duration) || 0), 0)

    return {
      baseSalary: Number(baseSum.toFixed(2)),
      slackSalary: Number(slackSum.toFixed(2)),
      totalSalary: totalSum,
      slackCount: countSum,
      slackDuration: durSum,
    }
  }, [dimension, salariesList, todayStr, todaySalary, rates])

  // 8. 生成当月日历网格
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1)
    const lastDay = new Date(calendarYear, calendarMonth, 0)
    const daysInMonth = lastDay.getDate()

    // 星期几（0=周日，转换为 1=周一 ... 7=周日）
    let startDayOfWeek = firstDay.getDay()
    if (startDayOfWeek === 0) startDayOfWeek = 7

    const cells: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = []

    // 填充月初空白
    for (let i = 1; i < startDayOfWeek; i++) {
      cells.push({ day: 0, dateStr: '', isCurrentMonth: false })
    }

    // 填充当前月的每一天
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, dateStr: dStr, isCurrentMonth: true })
    }

    return cells
  }, [calendarYear, calendarMonth])

  // 月份切换
  const handlePrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarYear((y) => y - 1)
      setCalendarMonth(12)
    } else {
      setCalendarMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarYear((y) => y + 1)
      setCalendarMonth(1)
    } else {
      setCalendarMonth((m) => m + 1)
    }
  }

  // 格式化时间段 HH:mm ~ HH:mm（精准解析本地时间，自动校准老数据 8 小时 UTC 时差）
  const formatTimeRange = (r: any) => {
    const s = r.start_time ?? r.startTime
    const e = r.end_time ?? r.endTime
    if (!s || !e) return '上班时段'
    try {
      const parseDt = (val: any) => {
        if (typeof val === 'number') {
          const d = new Date(val)
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        }
        const str = String(val).trim()
        const m = str.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
        if (m) {
          let h = parseInt(m[4], 10)
          const min = m[5]
          // 容错处理：如果是 0~6 点凌晨，判定为之前丢失时区的历史 UTC 脏数据，自动纠偏 +8 小时
          if (h >= 0 && h <= 6) {
            h = (h + 8) % 24
          }
          return `${String(h).padStart(2, '0')}:${min}`
        }
        const d = new Date(val)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      return `${parseDt(s)} ~ ${parseDt(e)}`
    } catch {
      return '上班时段'
    }
  }

  // 获取分类信息
  const getCategoryMeta = (catId: string) => {
    const cat = SLACK_CATEGORIES.find((c) => c.id === catId)
    return cat || { emoji: '🐟', name: '自由摸鱼' }
  }

  if (loading) {
    return (
      <div className="moyu-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h2>⏳ 正在加载打工人专属战报数据...</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="moyu-page" style={{ minHeight: '100vh', paddingBottom: 60 }}>
      {/* 顶部跑马灯 */}
      <div className="ticker">
        <div className="ticker-inner">
          <span>📅 打工人数据复盘中心 • 昨天的战果历历在目 • 每一分摸鱼收益都有迹可循 • 会复盘的牛马走得更远 • </span>
          <span>📅 打工人数据复盘中心 • 昨天的战果历历在目 • 每一分摸鱼收益都有迹可循 • 会复盘的牛马走得更远 • </span>
        </div>
      </div>

      <main className="container" style={{ maxWidth: 1100, margin: '20px auto', padding: '0 16px' }}>
        {/* 1. 顶栏导航 */}
        <header
          className="card"
          style={{
            background: '#fff',
            border: '3px solid var(--black)',
            boxShadow: '4px 4px 0 var(--black)',
            padding: '18px 24px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link
              to="/"
              style={{
                textDecoration: 'none',
                background: 'var(--yellow)',
                border: '2px solid var(--black)',
                borderRadius: 8,
                padding: '6px 14px',
                fontWeight: 900,
                color: 'var(--black)',
                boxShadow: '2px 2px 0 var(--black)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
              }}
            >
              🔙 返回工位大厅
            </Link>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>👤 个人数据中心</span>
                <span
                  style={{
                    fontSize: 12,
                    background: '#ffe600',
                    border: '2px solid var(--black)',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}
                >
                  {user?.nickname || user?.username}
                </span>
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555', fontWeight: 700 }}>
                打工底薪、摸鱼白嫖收益复盘，支持日历/表格与年月周日切换
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user?.role === 'admin' && (
              <Link to="/admin" className="auth-btn admin-btn">
                📊 管理员后台
              </Link>
            )}
            <button onClick={handleLogout} className="auth-btn logout-btn">
              🚪 退出登录
            </button>
          </div>
        </header>

        {/* 2. 打工人身价与参数档案卡片 */}
        <div
          className="card"
          style={{
            background: '#fffef0',
            border: '3px solid var(--black)',
            boxShadow: '4px 4px 0 var(--black)',
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 800 }}>💰 月薪档案</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--black)' }}>¥{fmtMoney(Number(settings.salary))}</div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 800 }}>💼 标准日薪</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#2b7fff' }}>¥{fmtMoney(rates.perDay)}</div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 800 }}>⚡ 秒薪速率</span>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#00c853' }}>¥{rates.perSecond.toFixed(4)}/秒</div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 800 }}>⏰ 工作时段</span>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{settings.workStart} ~ {settings.workEnd}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#777' }}>
            每月按照 {settings.workDays} 个出勤工作日精确折算
          </div>
        </div>

        {/* 3. 多维战报看板（切换年 / 月 / 周 / 日） */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📊 多维收益大盘</span>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>（点击切换统计周期）</span>
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  { id: 'day', label: '📅 今天' },
                  { id: 'week', label: '📆 本周' },
                  { id: 'month', label: '🗓️ 本月' },
                  { id: 'year', label: '📈 本年' },
                  { id: 'all', label: '🌐 历史总览' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDimension(tab.id)}
                  style={{
                    padding: '6px 12px',
                    border: '2px solid var(--black)',
                    borderRadius: 8,
                    background: dimension === tab.id ? 'var(--yellow)' : '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                    fontSize: 13,
                    boxShadow: dimension === tab.id ? '2px 2px 0 var(--black)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>💼 出勤基本工资</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#2b7fff', margin: '4px 0' }}>
                ¥{fmtMoney(statsSummary.baseSalary)}
              </div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>按合同出勤标准核算</div>
            </div>

            <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>🐟 摸鱼白嫖收益</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#00c853', margin: '4px 0' }}>
                ¥{fmtMoney(statsSummary.slackSalary)}
              </div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>已白嫖资本家资产</div>
            </div>

            <div className="card" style={{ background: 'var(--yellow)', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#111' }}>💰 实发累计总额</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--black)', margin: '4px 0' }}>
                ¥{fmtMoney(statsSummary.totalSalary)}
              </div>
              <div style={{ fontSize: 11, color: '#333', fontWeight: 800 }}>出勤底薪 + 白嫖收益</div>
            </div>

            <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>⏱️ 摸鱼总时长 / 频次</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--black)', margin: '6px 0' }}>
                {fmtDuration(statsSummary.slackDuration)}
              </div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>累计开摸 {statsSummary.slackCount} 次</div>
            </div>
          </div>
        </section>

        {/* 4. 次日复盘专用：昨天 vs 今天 战报对比与摸鱼表格 */}
        <section style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚔️ 次日复盘战报：昨天 vs 今天 对比表</span>
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#666', fontWeight: 700 }}>
              每天上班打开第一眼，快速复盘昨天摸了多久、白嫖了多少，今天继续稳步前进！
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
            {/* 昨天复盘卡片 */}
            <div
              className="card"
              style={{
                background: '#fff',
                border: '3px solid var(--black)',
                boxShadow: '4px 4px 0 var(--black)',
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: 10, marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>📅 昨天战绩 ({yesterdayStr})</span>
                  <div style={{ fontSize: 12, color: '#777', fontWeight: 700, marginTop: 2 }}>
                    出勤底薪: ¥{fmtMoney(yesterdaySalary.base_salary)} • 白嫖: +¥{fmtMoney(yesterdaySalary.slack_salary)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#00c853' }}>
                    {yesterdaySalary.slack_count} 次摸鱼
                  </div>
                  <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>
                    共 {fmtDuration(yesterdaySalary.slack_duration)}
                  </div>
                </div>
              </div>

              {/* 昨天摸鱼明细表格 */}
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>📋 昨天的摸鱼记录清单：</div>
              {yesterdayRecords.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '2px solid var(--black)' }}>
                        <th style={{ padding: '6px 8px' }}>类型</th>
                        <th style={{ padding: '6px 8px' }}>摸鱼时段</th>
                        <th style={{ padding: '6px 8px' }}>时长</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>白嫖收益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yesterdayRecords.map((r) => {
                        const meta = getCategoryMeta(r.category_id || r.categoryId)
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px', fontWeight: 800 }}>
                              {meta.emoji} {meta.name}
                            </td>
                            <td style={{ padding: '8px', color: '#555' }}>{formatTimeRange(r)}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{fmtDuration(r.duration)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#00c853', fontWeight: 900 }}>
                              +¥{fmtMoney(r.earned)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: '#888', background: '#fafafa', borderRadius: 8, border: '2px dashed #ddd' }}>
                  昨天暂无单独的摸鱼明细记录，可能全天在埋头苦干，或者属于公休日休整～
                </div>
              )}
            </div>

            {/* 今天战报卡片 */}
            <div
              className="card"
              style={{
                background: '#fffdf0',
                border: '3px solid var(--black)',
                boxShadow: '4px 4px 0 var(--black)',
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: 10, marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>🔥 今天战况 ({todayStr})</span>
                  <div style={{ fontSize: 12, color: '#777', fontWeight: 700, marginTop: 2 }}>
                    出勤底薪: ¥{fmtMoney(todaySalary.base_salary)} • 白嫖: +¥{fmtMoney(todaySalary.slack_salary)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#ff0055' }}>
                    {todaySalary.slack_count} 次摸鱼
                  </div>
                  <div style={{ fontSize: 11, color: '#666', fontWeight: 700 }}>
                    共 {fmtDuration(todaySalary.slack_duration)}
                  </div>
                </div>
              </div>

              {/* 今天摸鱼明细表格 */}
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>📋 今天的摸鱼记录清单：</div>
              {todayRecords.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--yellow)', borderBottom: '2px solid var(--black)' }}>
                        <th style={{ padding: '6px 8px' }}>类型</th>
                        <th style={{ padding: '6px 8px' }}>摸鱼时段</th>
                        <th style={{ padding: '6px 8px' }}>时长</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>白嫖收益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayRecords.map((r) => {
                        const meta = getCategoryMeta(r.category_id || r.categoryId)
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px', fontWeight: 800 }}>
                              {meta.emoji} {meta.name}
                            </td>
                            <td style={{ padding: '8px', color: '#555' }}>{formatTimeRange(r)}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{fmtDuration(r.duration)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#00c853', fontWeight: 900 }}>
                              +¥{fmtMoney(r.earned)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: '#888', background: '#fafafa', borderRadius: 8, border: '2px dashed #ddd' }}>
                  今天还没录入摸鱼记录，快回主页开摸白嫖老板的资产吧！
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 5. 打工与摸鱼日历大盘（Calendar Grid） */}
        <section style={{ marginBottom: 28 }}>
          <div
            className="card"
            style={{
              background: '#fff',
              border: '3px solid var(--black)',
              boxShadow: '4px 4px 0 var(--black)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🗓️ 打工摸鱼月度日历</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>（点击任意日期可查看当天所有摸鱼流水）</span>
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  style={{
                    padding: '4px 12px',
                    border: '2px solid var(--black)',
                    borderRadius: 6,
                    background: '#f0f0f0',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  ◀ 上月
                </button>
                <span style={{ fontSize: 16, fontWeight: 900 }}>
                  {calendarYear}年 {calendarMonth}月
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  style={{
                    padding: '4px 12px',
                    border: '2px solid var(--black)',
                    borderRadius: 6,
                    background: '#f0f0f0',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  下月 ▶
                </button>
              </div>
            </div>

            {/* 日历周标题 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 900, fontSize: 13, marginBottom: 8, background: '#f5f5f5', padding: '8px 0', border: '2px solid var(--black)', borderRadius: 8 }}>
              <span>周一</span>
              <span>周二</span>
              <span>周三</span>
              <span>周四</span>
              <span>周五</span>
              <span style={{ color: '#ff0055' }}>周六</span>
              <span style={{ color: '#ff0055' }}>周日</span>
            </div>

            {/* 日历单元格网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {calendarGrid.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div
                      key={idx}
                      style={{
                        minHeight: 74,
                        background: '#fafafa',
                        borderRadius: 6,
                        border: '1px dashed #e0e0e0',
                      }}
                    />
                  )
                }

                const daySalary = getSalaryByDate(cell.dateStr)
                const isToday = cell.dateStr === todayStr
                const isYesterday = cell.dateStr === yesterdayStr
                const isSelected = cell.dateStr === selectedDate
                const hasSlack = daySalary.slack_salary > 0

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    style={{
                      minHeight: 74,
                      padding: '6px 4px',
                      borderRadius: 8,
                      border: isSelected ? '3px solid #111' : isToday ? '2px solid #ff9100' : '2px solid #e0e0e0',
                      background: isSelected
                        ? 'var(--yellow)'
                        : isToday
                        ? '#fff8e1'
                        : isYesterday
                        ? '#f3e5f5'
                        : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.1s',
                      boxShadow: isSelected ? '3px 3px 0 var(--black)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 900 }}>
                      <span style={{ paddingLeft: 4 }}>{cell.day}</span>
                      {isToday && (
                        <span style={{ fontSize: 9, background: '#ff5722', color: '#fff', padding: '1px 4px', borderRadius: 4 }}>
                          今日
                        </span>
                      )}
                      {isYesterday && (
                        <span style={{ fontSize: 9, background: '#9c27b0', color: '#fff', padding: '1px 4px', borderRadius: 4 }}>
                          昨日
                        </span>
                      )}
                    </div>

                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 800 }}>
                      {hasSlack ? (
                        <div style={{ color: '#00c853' }}>+¥{fmtMoney(daySalary.slack_salary)}</div>
                      ) : (
                        <div style={{ color: '#999', fontSize: 10 }}>拉磨中</div>
                      )}
                      <div style={{ color: '#666', fontSize: 9 }}>底薪: ¥{Math.round(daySalary.base_salary)}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 点击日期下钻出的当日摸鱼记录明细卡片 */}
            <div
              style={{
                marginTop: 18,
                padding: '14px 16px',
                background: '#f9f9f9',
                border: '2px solid var(--black)',
                borderRadius: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  🔍 日期下钻详情：{selectedDate} {selectedDate === todayStr ? '（今天）' : selectedDate === yesterdayStr ? '（昨天）' : ''}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#555' }}>
                  出勤底薪: ¥{fmtMoney(selectedSalary.base_salary)} • 白嫖摸鱼: +¥{fmtMoney(selectedSalary.slack_salary)} • 当日总计: ¥{fmtMoney(selectedSalary.total_salary)}
                </div>
              </div>

              {selectedRecords.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12, marginTop: 6 }}>
                  <thead>
                    <tr style={{ background: '#eee', borderBottom: '2px solid var(--black)' }}>
                      <th style={{ padding: '6px 8px' }}>摸鱼类型</th>
                      <th style={{ padding: '6px 8px' }}>摸鱼时段</th>
                      <th style={{ padding: '6px 8px' }}>时长</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>白嫖收益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecords.map((r) => {
                      const meta = getCategoryMeta(r.category_id || r.categoryId)
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 800 }}>
                            {meta.emoji} {meta.name}
                          </td>
                          <td style={{ padding: '6px 8px' }}>{formatTimeRange(r)}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 800 }}>{fmtDuration(r.duration)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#00c853', fontWeight: 900 }}>
                            +¥{fmtMoney(r.earned)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 12, color: '#888', padding: '10px 0', textAlign: 'center' }}>
                  该日期暂无明细摸鱼流水记录。
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 6. 历史每日工资快照流水表格 */}
        <section>
          <div
            className="card"
            style={{
              background: '#fff',
              border: '3px solid var(--black)',
              boxShadow: '4px 4px 0 var(--black)',
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 900 }}>
              📋 每日出勤与工资快照历史表
            </h3>
            {salariesList.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--yellow)', borderBottom: '3px solid var(--black)', fontWeight: 900 }}>
                      <th style={{ padding: '10px 8px' }}>日期</th>
                      <th style={{ padding: '10px 8px' }}>时间维度</th>
                      <th style={{ padding: '10px 8px' }}>出勤基本工资</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼白嫖收益</th>
                      <th style={{ padding: '10px 8px' }}>当日已赚实发</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼频次</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salariesList.map((s) => (
                      <tr key={s.id || s.date} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 900 }}>{s.date}</td>
                        <td style={{ padding: '10px 8px', fontSize: 12 }}>
                          {s.year}年 / {s.month}月 / 第{s.week}周
                        </td>
                        <td style={{ padding: '10px 8px', color: '#2b7fff', fontWeight: 800 }}>
                          ¥{fmtMoney(s.base_salary)}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#00c853', fontWeight: 900 }}>
                          ¥{fmtMoney(s.slack_salary)}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 900, color: 'var(--black)' }}>
                          ¥{fmtMoney(s.total_salary)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{s.slack_count} 次</td>
                        <td style={{ padding: '10px 8px' }}>{fmtDuration(s.slack_duration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                暂无历史工资快照记录，开摸后将自动每天归档存证。
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

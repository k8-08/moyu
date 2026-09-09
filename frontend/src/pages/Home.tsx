import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import '../App.css'
import TimePicker from '../components/TimePicker'
import { authApi, profileApi, recordsApi, salaryApi, type UserInfo } from '../api/client'
import {
  type ActiveSlack,
  DELETE_CONFIRM_MESSAGES,
  fmtCountdown,
  fmtDuration,
  fmtDurationShort,
  fmtMoney,
  getRates,
  getRemainingWorkSeconds,
  getStageText,
  getTotalWorkSeconds,
  getWorkedSecondsToday,
  getWorkStatus,
  ITEMS,
  LEVELS,
  type MoyuSettings,
  QUOTES,
  SLACK_CATEGORIES,
  type SlackCategory,
  type SlackRecord,
} from '../lib/moyuTypes'
import {
  getTodayStr,
  loadActiveSlackFromStorage,
  loadRecordsFromStorage,
  loadSettingsFromStorage,
  saveActiveSlackToStorage,
  saveRecordsToStorage,
  saveSettingsToStorage,
} from '../lib/moyuStorage'

// 生成严格限制在上班时间 [startStr, endStr] 内的时间刻度列表（超出上班时间根本没有选项）
function generateWorkTimeSlots(startStr: string, endStr: string, stepMinutes = 5): string[] {
  const [sH, sM] = (startStr || '08:30').split(':').map(Number)
  const [eH, eM] = (endStr || '17:30').split(':').map(Number)
  const startMin = sH * 60 + sM
  const endMin = eH * 60 + eM
  const slots: string[] = []
  for (let m = startMin; m <= endMin; m += stepMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}

export default function Home() {
  const navigate = useNavigate()

  /* ------------ 0. 用户鉴权与云端状态 ------------ */
  const [user, setUser] = useState<UserInfo | null>(null)

  /* ------------ 1. 打工参数设置 ------------ */
  const [settings, setSettings] = useState<MoyuSettings>(loadSettingsFromStorage)
  const [showSettings, setShowSettings] = useState<boolean>(() => !settings.salary)

  const handleUpdateSetting = (field: keyof MoyuSettings, val: string) => {
    setSettings((prev) => {
      const next = { ...prev, [field]: val }
      saveSettingsToStorage(next)
      // 若已登录，同步到云端打工档案
      if (localStorage.getItem('moyu_token')) {
        const sal = parseFloat(next.salary) || 0
        const days = parseFloat(next.workDays) || 21.75
        profileApi.update({
          salary: sal,
          work_days: days,
          work_start: next.workStart,
          work_end: next.workEnd,
          lunch_start: next.lunchStart,
          lunch_end: next.lunchEnd,
        }).catch((err) => console.error('Failed to sync profile', err))
      }
      return next
    })
  }

  /* ------------ 2. 核心状态：时钟与摸鱼记录 ------------ */
  const [records, setRecords] = useState<SlackRecord[]>(loadRecordsFromStorage)
  const [activeSlack, setActiveSlack] = useState<ActiveSlack | null>(loadActiveSlackFromStorage)
  const [now, setNow] = useState<Date>(() => new Date())
  const [modalCategory, setModalCategory] = useState<SlackCategory | null>(null)
  const [customMin, setCustomMin] = useState<string>('')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')

  // 页面挂载时：获取当前登录用户与云端数据，未登录直接进入登录界面
  useEffect(() => {
    const initCloudData = async () => {
      const token = localStorage.getItem('moyu_token')
      if (!token) {
        navigate('/login', { replace: true })
        return
      }
      try {
        const me = await authApi.getMe()
        setUser(me)

        let curSal = parseFloat(settings.salary) || 10000
        let curDays = parseFloat(settings.workDays) || 21.75

        // 1. 获取打工档案
        const p = await profileApi.get()
        if (p && p.salary) {
          curSal = p.salary
          curDays = p.work_days || 21.75
          const cloudSettings: MoyuSettings = {
            salary: String(p.salary),
            workDays: String(p.work_days),
            workStart: p.work_start,
            workEnd: p.work_end,
            lunchStart: p.lunch_start,
            lunchEnd: p.lunch_end,
          }
          setSettings(cloudSettings)
          saveSettingsToStorage(cloudSettings)
        }

        const initialDailyBase = Number((curSal / curDays).toFixed(2))

        // 2. 获取今日摸鱼记录
        const cloudRecs = await recordsApi.getToday()
        if (cloudRecs && Array.isArray(cloudRecs)) {
          const mapped: SlackRecord[] = cloudRecs.map((r) => ({
            id: r.id,
            categoryId: r.category_id as any,
            startTime: r.start_time,
            endTime: r.end_time,
            duration: r.duration,
            earned: r.earned,
          }))
          setRecords(mapped)
          saveRecordsToStorage(mapped)
          const sumEarn = mapped.reduce((s, r) => s + r.earned, 0)
          const sumDur = mapped.reduce((s, r) => s + r.duration, 0)
          salaryApi.reportToday({
            date: getTodayStr(),
            base_salary: initialDailyBase,
            slack_salary: sumEarn,
            total_salary: Number((initialDailyBase + sumEarn).toFixed(2)),
            slack_count: mapped.length,
            slack_duration: Math.round(sumDur),
          }).catch(() => {})
        }
      } catch (e) {
        console.error('Failed to init user or cloud data', e)
        localStorage.removeItem('moyu_token')
        navigate('/login', { replace: true })
      }
    }
    initCloudData()
  }, [])

  // 100ms 刷新一次时间，驱动秒薪和摸鱼跳动
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 100)
    return () => clearInterval(timer)
  }, [])

  // 跨日检测：每分钟检查一次，跨天自动重置
  useEffect(() => {
    let lastDate = getTodayStr()
    const checkDay = setInterval(() => {
      const curDate = getTodayStr()
      if (curDate !== lastDate) {
        lastDate = curDate
        setRecords([])
        setActiveSlack(null)
        saveRecordsToStorage([])
        saveActiveSlackToStorage(null)
      }
    }, 30000)
    return () => clearInterval(checkDay)
  }, [])

  /* ------------ 3. 费率与宏观牛马时钟计算 ------------ */
  const rates = useMemo(() => getRates(settings), [settings])

  // 今日工作进度与实时百分比
  const workedSeconds = useMemo(() => getWorkedSecondsToday(settings, now), [settings, now])
  const totalWorkSeconds = useMemo(() => getTotalWorkSeconds(settings), [settings])
  const progressPct = totalWorkSeconds > 0 ? Math.min(100, Math.max(0, (workedSeconds / totalWorkSeconds) * 100)) : 0
  const progressDisplay = `${progressPct.toFixed(1)}%`
  const todayEarned = workedSeconds * rates.perSecond
  const todayExpected = totalWorkSeconds * rates.perSecond
  const remainingSeconds = useMemo(() => getRemainingWorkSeconds(settings, now), [settings, now])
  const stageSpeech = getStageText(progressPct)
  const workStatus = useMemo(() => getWorkStatus(settings, now), [settings, now])

  /* ------------ 4. 微观当前摸鱼收益计算 ------------ */
  const activeElapsed = useMemo(() => {
    if (!activeSlack) return 0
    return Math.max(0, (now.getTime() - activeSlack.startTime) / 1000)
  }, [activeSlack, now])

  const activeEarned = activeElapsed * rates.perSecond

  // 摸鱼汇总统计
  const totalSlackEarned = useMemo(() => {
    const fromRecords = records.reduce((s, r) => s + r.earned, 0)
    return fromRecords + activeEarned
  }, [records, activeEarned])

  const totalSlackDuration = useMemo(() => {
    const fromRecords = records.reduce((s, r) => s + r.duration, 0)
    return fromRecords + activeElapsed
  }, [records, activeElapsed])

  const totalSlackCount = records.length + (activeSlack ? 1 : 0)

  /* ------------ 5. 摸鱼交互行为 ------------ */

  // 点击摸鱼分类
  const handleClickCategory = (cat: SlackCategory) => {
    if (!parseFloat(settings.salary)) {
      setShowSettings(true)
      alert('⚠️ 请先在设置里输入你的月薪，有了家底才好开始摸鱼变现～')
      return
    }

    if (activeSlack) {
      if (activeSlack.categoryId === cat.id) {
        alert(`你当前已经在「${cat.name}」中啦，正在持续白嫖中！`)
        return
      }
      const activeCat = SLACK_CATEGORIES.find((c) => c.id === activeSlack.categoryId)
      const ok = window.confirm(
        `你正在进行「${activeCat?.name || '摸鱼'}」，确定要先结束并切换到「${cat.name}」吗？\n（当前摸鱼将自动结账归档）`
      )
      if (!ok) return
      // 结束当前摸鱼
      endActiveSlack()
    }

    setModalCategory(cat)
    setCustomMin('')

    // 初始化时段：默认选取上班时间范围内的合法刻度
    const slots = generateWorkTimeSlots(settings.workStart, settings.workEnd, 5)
    if (slots.length >= 2) {
      const nowH = now.getHours()
      const nowM = now.getMinutes()
      const nowTotal = nowH * 60 + nowM
      const [sH, sM] = settings.workStart.split(':').map(Number)
      const [eH, eM] = settings.workEnd.split(':').map(Number)
      const startTotal = sH * 60 + sM
      const endTotal = eH * 60 + eM

      if (nowTotal >= startTotal + 15 && nowTotal <= endTotal) {
        const currentSlotMin = Math.floor(nowTotal / 5) * 5
        const endSlotM = Math.min(endTotal, currentSlotMin)
        const startSlotM = Math.max(startTotal, endSlotM - 30)
        const sStr = `${String(Math.floor(startSlotM / 60)).padStart(2, '0')}:${String(startSlotM % 60).padStart(2, '0')}`
        const eStr = `${String(Math.floor(endSlotM / 60)).padStart(2, '0')}:${String(endSlotM % 60).padStart(2, '0')}`
        setPeriodStart(sStr)
        setPeriodEnd(eStr)
      } else {
        const defaultEndM = Math.min(endTotal, startTotal + 30)
        const eStr = `${String(Math.floor(defaultEndM / 60)).padStart(2, '0')}:${String(defaultEndM % 60).padStart(2, '0')}`
        setPeriodStart(settings.workStart)
        setPeriodEnd(eStr)
      }
    }
  }

  // 严格在上班时间 [workStart, workEnd] 内的刻度点（超出上班时间根本没有选项，无法被选中）
  const workTimeSlots = useMemo(() => {
    return generateWorkTimeSlots(settings.workStart, settings.workEnd, 5)
  }, [settings.workStart, settings.workEnd])

  const validStartSlots = useMemo(() => {
    if (workTimeSlots.length <= 1) return workTimeSlots
    return workTimeSlots.slice(0, -1)
  }, [workTimeSlots])

  const validEndSlots = useMemo(() => {
    if (!periodStart) return workTimeSlots.slice(1)
    return workTimeSlots.filter((t) => t > periodStart)
  }, [workTimeSlots, periodStart])

  // 计算选定时段的分钟数
  const periodMinutes = useMemo(() => {
    if (!periodStart || !periodEnd) return 0
    if (periodStart >= periodEnd) return 0
    const [sH, sM] = periodStart.split(':').map(Number)
    const [eH, eM] = periodEnd.split(':').map(Number)
    return Math.max(0, (eH * 60 + eM) - (sH * 60 + sM))
  }, [periodStart, periodEnd])

  // 开始实时开摸
  const startLiveSlack = () => {
    if (!modalCategory) return
    const newActive: ActiveSlack = {
      categoryId: modalCategory.id,
      startTime: Date.now(),
      date: getTodayStr(),
    }
    setActiveSlack(newActive)
    saveActiveSlackToStorage(newActive)
    setModalCategory(null)
  }

  // 辅助：向后端上报并汇总今日工资表
  const syncDailySalaryReport = useCallback(
    (currentRecords: SlackRecord[], currentSlackEarned: number, currentSlackDuration: number) => {
      if (!localStorage.getItem('moyu_token')) return
      const baseEarn = workedSeconds * rates.perSecond
      salaryApi
        .reportToday({
          date: getTodayStr(),
          base_salary: Number(baseEarn.toFixed(2)),
          slack_salary: Number(currentSlackEarned.toFixed(2)),
          total_salary: Number((baseEarn + currentSlackEarned).toFixed(2)),
          slack_count: currentRecords.length,
          slack_duration: Math.round(currentSlackDuration),
        })
        .catch((err) => console.error('Failed to report daily salary', err))
    },
    [workedSeconds, rates]
  )

  // 补录快速摸鱼（严格限制在上班时间范围内）
  const handleQuickRecord = async (minutes: number) => {
    if (!modalCategory || minutes <= 0) return

    const [sH, sM] = settings.workStart.split(':').map(Number)
    const [eH, eM] = settings.workEnd.split(':').map(Number)
    const startWorkMin = sH * 60 + sM
    const endWorkMin = eH * 60 + eM

    const today = new Date()
    const nowH = today.getHours()
    const nowM = today.getMinutes()
    const nowTotalMin = nowH * 60 + nowM

    // 如果当前还没到上班时间
    if (nowTotalMin < startWorkMin) {
      alert(`当前时间（${String(nowH).padStart(2, '0')}:${String(nowM).padStart(2, '0')}）还没到上班时间（${settings.workStart}）哦！\n带薪摸鱼只能在上班期间进行，请在下方“工作时段补录”中选择上班后的时间段～`)
      return
    }

    // 确定结束时间（上限不得超过下班时间 settings.workEnd）
    const endMin = Math.min(nowTotalMin, endWorkMin)
    // 确定开始时间（下限不得早于上班时间 settings.workStart）
    const startMin = Math.max(startWorkMin, endMin - minutes)

    const actualMinutes = endMin - startMin
    if (actualMinutes <= 0) {
      alert(`所选时间超出了上班时间范围（${settings.workStart} ~ ${settings.workEnd}），无法生成有效摸鱼记录！`)
      return
    }

    const durSec = actualMinutes * 60
    const earn = durSec * rates.perSecond

    const startObj = new Date(today.getFullYear(), today.getMonth(), today.getDate(), Math.floor(startMin / 60), startMin % 60, 0)
    const endObj = new Date(today.getFullYear(), today.getMonth(), today.getDate(), Math.floor(endMin / 60), endMin % 60, 0)

    const newRec: SlackRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId: modalCategory.id,
      startTime: startObj.getTime(),
      endTime: endObj.getTime(),
      duration: durSec,
      earned: earn,
    }

    const updated = [newRec, ...records]
    setRecords(updated)
    saveRecordsToStorage(updated)
    setModalCategory(null)

    // 若已登录，同步记录到云端并更新工资表
    if (localStorage.getItem('moyu_token')) {
      try {
        await recordsApi.create({
          id: newRec.id,
          category_id: newRec.categoryId,
          start_time: newRec.startTime,
          end_time: newRec.endTime,
          duration: newRec.duration,
          earned: newRec.earned,
        })
        const sumEarn = updated.reduce((s, r) => s + r.earned, 0)
        const sumDur = updated.reduce((s, r) => s + r.duration, 0)
        syncDailySalaryReport(updated, sumEarn, sumDur)
      } catch (e) {
        console.error('Failed to sync record to cloud', e)
      }
    }
  }

  // 补录自定义时段摸鱼（严格限制在上班时间段 settings.workStart ~ settings.workEnd 之内）
  const handlePeriodRecord = async () => {
    if (!modalCategory) return
    if (!periodStart || !periodEnd) {
      alert('请完整选择摸鱼开始时间与结束时间！')
      return
    }

    if (periodStart < settings.workStart || periodEnd > settings.workEnd) {
      alert(`摸鱼时段只能在上班时间（${settings.workStart} ~ ${settings.workEnd}）内哦！非工作时间不计入带薪摸鱼～`)
      return
    }

    if (periodStart >= periodEnd) {
      alert('摸鱼开始时间必须早于结束时间！')
      return
    }

    const [sH, sM] = periodStart.split(':').map(Number)
    const [eH, eM] = periodEnd.split(':').map(Number)
    const durationMinutes = (eH * 60 + eM) - (sH * 60 + sM)

    if (durationMinutes <= 0) {
      alert('摸鱼时长必须大于 0 分钟！')
      return
    }

    const durSec = durationMinutes * 60
    const earn = durSec * rates.perSecond

    // 构造今天的起止时间戳
    const today = new Date()
    const startObj = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sH, sM, 0)
    const endObj = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eH, eM, 0)

    const newRec: SlackRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId: modalCategory.id,
      startTime: startObj.getTime(),
      endTime: endObj.getTime(),
      duration: durSec,
      earned: earn,
    }

    const updated = [newRec, ...records]
    setRecords(updated)
    saveRecordsToStorage(updated)
    setModalCategory(null)

    // 若已登录，同步记录到云端并更新工资表
    if (localStorage.getItem('moyu_token')) {
      try {
        await recordsApi.create({
          id: newRec.id,
          category_id: newRec.categoryId,
          start_time: newRec.startTime,
          end_time: newRec.endTime,
          duration: newRec.duration,
          earned: newRec.earned,
        })
        const sumEarn = updated.reduce((s, r) => s + r.earned, 0)
        const sumDur = updated.reduce((s, r) => s + r.duration, 0)
        syncDailySalaryReport(updated, sumEarn, sumDur)
      } catch (e) {
        console.error('Failed to sync record to cloud', e)
      }
    }
  }

  // 结束当前正在进行的摸鱼
  const endActiveSlack = async () => {
    if (!activeSlack) return
    const elapsed = Math.max(1, (Date.now() - activeSlack.startTime) / 1000)
    const earned = elapsed * rates.perSecond
    const newRec: SlackRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId: activeSlack.categoryId,
      startTime: activeSlack.startTime,
      endTime: Date.now(),
      duration: elapsed,
      earned,
    }

    const updated = [newRec, ...records]
    setRecords(updated)
    saveRecordsToStorage(updated)
    setActiveSlack(null)
    saveActiveSlackToStorage(null)

    // 若已登录，同步记录到云端并更新工资表
    if (localStorage.getItem('moyu_token')) {
      try {
        await recordsApi.create({
          id: newRec.id,
          category_id: newRec.categoryId,
          start_time: newRec.startTime,
          end_time: newRec.endTime,
          duration: newRec.duration,
          earned: newRec.earned,
        })
        const sumEarn = updated.reduce((s, r) => s + r.earned, 0)
        const sumDur = updated.reduce((s, r) => s + r.duration, 0)
        syncDailySalaryReport(updated, sumEarn, sumDur)
      } catch (e) {
        console.error('Failed to sync record to cloud', e)
      }
    }
  }

  // 销毁单条罪证
  const handleDeleteRecord = async (rec: SlackRecord) => {
    const confirmMsg =
      DELETE_CONFIRM_MESSAGES[rec.categoryId] ||
      `确定要销毁这条摸鱼记录吗？\n价值 ¥${fmtMoney(rec.earned)} 的白嫖收益将被抹去！`
    if (!window.confirm(confirmMsg)) return

    const updated = records.filter((r) => r.id !== rec.id)
    setRecords(updated)
    saveRecordsToStorage(updated)

    // 若已登录，从云端删除并更新工资表
    if (localStorage.getItem('moyu_token')) {
      try {
        await recordsApi.delete(rec.id)
        const sumEarn = updated.reduce((s, r) => s + r.earned, 0)
        const sumDur = updated.reduce((s, r) => s + r.duration, 0)
        syncDailySalaryReport(updated, sumEarn, sumDur)
      } catch (e) {
        console.error('Failed to delete cloud record', e)
      }
    }
  }

  // 每日工资自动心跳同步（每 60 秒上报一次实时已赚工资）
  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      const sumEarn = records.reduce((s, r) => s + r.earned, 0) + activeEarned
      const sumDur = records.reduce((s, r) => s + r.duration, 0) + activeElapsed
      syncDailySalaryReport(records, sumEarn, sumDur)
    }, 60000)
    return () => clearInterval(timer)
  }, [user, records, activeEarned, activeElapsed, syncDailySalaryReport])

  /* ------------ 6. 摸鱼圣经与段位 ------------ */
  const [quote, setQuote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)])
  const drawQuote = useCallback(() => {
    setQuote((q) => {
      let next = q
      while (next === q) next = QUOTES[Math.floor(Math.random() * QUOTES.length)]
      return next
    })
  }, [])

  const level = useMemo(() => {
    let lv = LEVELS[0]
    for (const l of LEVELS) if (totalSlackEarned >= l.min) lv = l
    return lv
  }, [totalSlackEarned])

  const nextLevel = LEVELS.find((l) => l.min > totalSlackEarned)
  const levelProgress = nextLevel
    ? Math.min(100, ((totalSlackEarned - level.min) / (nextLevel.min - level.min)) * 100)
    : 100

  // 正在摸鱼的分类信息
  const activeCategory = SLACK_CATEGORIES.find((c) => c.id === activeSlack?.categoryId)

  return (
    <div className="moyu-page">
      {/* 顶部跑马灯 */}
      <div className="ticker">
        <div className="ticker-inner">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              🐂 牛马时钟已就位 &nbsp;•&nbsp; 🐟 摸鱼第一 工作第二 &nbsp;•&nbsp; 💰 每一秒打工都在变现 &nbsp;•&nbsp;
              🚽 带薪拉屎是打工人的尊严 &nbsp;•&nbsp; 🏃 距离刑满释放越来越近 &nbsp;•&nbsp; 🦈 会摸鱼才是核心竞争力
              &nbsp;•&nbsp;
            </span>
          ))}
        </div>
      </div>

      <main className="container">
        {/* 顶部用户状态栏 */}
        <div className="auth-bar" style={{ marginTop: 14, marginBottom: -6 }}>
          {user ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="auth-user-info">
                <span>👤 {user.nickname || user.username}</span>
                <Link
                  to="/user-center"
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    background: 'var(--yellow)',
                    color: 'var(--black)',
                    textDecoration: 'none',
                    padding: '3px 10px',
                    borderRadius: 8,
                    border: '2px solid var(--black)',
                    boxShadow: '2px 2px 0 var(--black)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                  title="点击进入个人中心：查看日历打工收成与昨日摸鱼复盘战报"
                >
                  👤 个人中心
                </Link>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {user.role === 'admin' && (
                  <Link to="/admin" className="auth-btn admin-btn">
                    📊 后台管理看板
                  </Link>
                )}
                <button
                  onClick={() => {
                    authApi.logout()
                    setUser(null)
                    navigate('/login')
                  }}
                  className="auth-btn logout-btn"
                >
                  🚪 退出
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#444' }}>
                💡 登录后可将打工档案与摸鱼收益永久同步至云端
              </span>
              <Link to="/login" className="auth-btn login-btn">
                🔑 登录 / 注册
              </Link>
            </div>
          )}
        </div>

        {/* 英雄头 */}
        <header className="hero">
          <span className="fish f1">🐟</span>
          <span className="fish f2">🐂</span>
          <span className="fish f3">🐡</span>
          <span className="fish f4">🏃</span>
          <div className="badge">打工人 · 精神股东 · 牛马变现神器</div>
          <h1>
            摸<span className="hl">鱼</span>计算器
          </h1>
          <p className="sub">上班拉磨看变现，带薪摸鱼白嫖爽 💸</p>
        </header>

        {/* 1. 打工参数设置 */}
        <section className="card settings">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>⚙️ 打工档案</h2>
            <button className="settings-toggle-btn" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? '▲ 收起设置' : '▼ 展开修改档案'}
            </button>
          </div>

          {showSettings && (
            <div className="fields" style={{ marginTop: 12 }}>
              <label className="field">
                <span>💰 月薪（税前元）</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settings.salary}
                  onChange={(e) => handleUpdateSetting('salary', e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="10000"
                />
              </label>
              <label className="field">
                <span>📅 月计薪天数</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settings.workDays}
                  onChange={(e) => handleUpdateSetting('workDays', e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="21.75"
                />
              </label>
              <div className="field">
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>⏰ 上班时间</span>
                <TimePicker
                  value={settings.workStart}
                  onChange={(val) => handleUpdateSetting('workStart', val)}
                  presetType="start"
                />
              </div>
              <div className="field">
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🏠 下班时间</span>
                <TimePicker
                  value={settings.workEnd}
                  onChange={(val) => handleUpdateSetting('workEnd', val)}
                  presetType="end"
                />
              </div>
              <div className="field">
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🍱 午休开始</span>
                <TimePicker
                  value={settings.lunchStart}
                  onChange={(val) => handleUpdateSetting('lunchStart', val)}
                  presetType="lunch"
                />
              </div>
              <div className="field">
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🍱 午休结束</span>
                <TimePicker
                  value={settings.lunchEnd}
                  onChange={(val) => handleUpdateSetting('lunchEnd', val)}
                  presetType="lunch"
                />
              </div>
            </div>
          )}

          <div className="rates">
            <div className="rate-chip c-green">日薪 ¥{fmtMoney(rates.perDay)}</div>
            <div className="rate-chip c-green">时薪 ¥{fmtMoney(rates.perHour)}</div>
            <div className="rate-chip c-pink">分薪 ¥{fmtMoney(rates.perMinute)}</div>
            <div className="rate-chip c-blue">秒薪 ¥{fmtMoney(rates.perSecond, 4)}</div>
            <div className="rate-chip" style={{ background: '#fdf0d5' }}>
              每日工时 {rates.workHours.toFixed(1)} 小时
            </div>
          </div>
        </section>

        {/* 2. 牛马时钟主屏（今日已赚 & 拉磨进度 & 倒计时） */}
        <section className="niuma-card">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="niuma-title" style={{ margin: 0 }}>🐂 牛马时钟 · 劳动变现大屏</div>
            <div className={`work-status-badge ${workStatus.cls}`}>
              {workStatus.label} · {workStatus.desc}
            </div>
          </div>
          <div className="niuma-earned">
            <span className="yuan">¥</span>
            {fmtMoney(todayEarned).split('.')[0]}
            <span className="dec">.{fmtMoney(todayEarned).split('.')[1]}</span>
          </div>
          <div className="niuma-subinfo">
            <span className="tag">今日预计 ¥{fmtMoney(todayExpected)}</span>
            <span className="tag">已打工 {fmtDurationShort(workedSeconds)}</span>
            <span className="tag" style={{ background: '#ffe4e6' }}>进度 {progressDisplay}</span>
          </div>

          {/* 拉磨进度条 */}
          <div className="track-wrap">
            <div className="track-mascot" style={{ left: `${Math.min(97, Math.max(3, progressPct))}%` }}>
              <span className="mascot-tag">{progressDisplay}</span>
              <span className="mascot-body">🐂</span>
            </div>
            <div className="track-bar">
              <div className="track-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
            <div className="track-labels">
              <span>0% 开工</span>
              <span className="mid-mark">50% 半程</span>
              <span>100% 卸磨</span>
            </div>
          </div>

          <div className="stage-speech">{stageSpeech}</div>

          {/* 刑满释放倒计时 */}
          <div>
            <div className="countdown-box">
              <span className="cd-label">⛓️ 距刑满释放</span>
              <span className="cd-val">{fmtCountdown(remainingSeconds)}</span>
            </div>
          </div>
        </section>

        {/* 3. 正在摸鱼态卡片（若当前有进行中的摸鱼） */}
        {activeSlack && activeCategory && (
          <section className="active-slack-banner">
            <div className="slack-emoji-huge">{activeCategory.emoji}</div>
            <div className="slack-state-title">「{activeCategory.name}」带薪摸鱼进行中…</div>
            <div className="slack-big-money">¥ {fmtMoney(activeEarned, 4)}</div>
            <div className="slack-time-text">⏱ 已持续白嫖 {fmtDuration(activeElapsed)}</div>
            <button className="btn b-red" onClick={endActiveSlack}>
              🏃 摸完了！收工结账
            </button>
          </section>
        )}

        {/* 4. 8大摸鱼分类网格（开始摸鱼） */}
        <section className="card">
          <div className="slack-grid-title">
            <h2>🎮 精准摸鱼（点击开摸）</h2>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>支持正向计时与补录时长</span>
          </div>
          <div className="slack-grid">
            {SLACK_CATEGORIES.map((cat) => {
              const isCurrent = activeSlack?.categoryId === cat.id
              return (
                <div
                  key={cat.id}
                  className={`slack-tile ${isCurrent ? 'active-now' : ''}`}
                  onClick={() => handleClickCategory(cat)}
                >
                  <span className="tile-emoji">{cat.emoji}</span>
                  <span className="tile-name">{cat.name}</span>
                  <span className="tile-desc">{cat.desc}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* 5. 换算玩梗（白嫖了老板多少战利品） */}
        <section className="card convert">
          <h2>💱 今天摸鱼白嫖的钱，等于让老板请了：</h2>
          <div className="items">
            {ITEMS.map((it) => {
              const n = totalSlackEarned / it.price
              return (
                <div className="item" key={it.name}>
                  <div className="item-emoji">{it.emoji}</div>
                  <div className="item-name">{it.name}</div>
                  <div className="item-val">
                    {n >= 1 ? `${Math.floor(n)} ${it.unit}` : `${(n * 100).toFixed(1)}% ${it.unit}`}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 6. 今日摸鱼汇总看板与罪证流水明细 */}
        <section className="records-card">
          <h2>📋 今日摸鱼清单</h2>

          {/* 汇总统计 */}
          <div className="summary-board">
            <div className="summary-col">
              <div className="num">{totalSlackCount} 次</div>
              <div className="lab">今日摸鱼频次</div>
            </div>
            <div className="summary-col">
              <div className="num">{fmtDurationShort(totalSlackDuration)}</div>
              <div className="lab">累计白嫖时长</div>
            </div>
            <div className="summary-col">
              <div className="num" style={{ color: '#009d57' }}>
                ¥ {fmtMoney(totalSlackEarned)}
              </div>
              <div className="lab">摸鱼白嫖总收入</div>
            </div>
          </div>

          {/* 流水明细 */}
          {records.length === 0 && !activeSlack ? (
            <div className="records-empty">🐟 今天还没有任何摸鱼罪证，快选个分类开摸吧！</div>
          ) : (
            <div className="records-list">
              {records.map((rec) => {
                const cat = SLACK_CATEGORIES.find((c) => c.id === rec.categoryId)
                const timeStr = new Date(rec.startTime).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div className="record-row" key={rec.id}>
                    <div className="record-left">
                      <span className="record-emoji">{cat?.emoji || '🐟'}</span>
                      <div className="record-info">
                        <div className="rec-title">{cat?.name || '摸鱼'}</div>
                        <div className="rec-time">{timeStr} 开始</div>
                      </div>
                    </div>
                    <div className="record-right">
                      <div className="rec-earn-box">
                        <div className="rec-val">+¥{fmtMoney(rec.earned)}</div>
                        <div className="rec-dur">{fmtDurationShort(rec.duration)}</div>
                      </div>
                      <button
                        className="rec-del-btn"
                        title="销毁罪证"
                        onClick={() => handleDeleteRecord(rec)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 7. 今日战报与段位 */}
        <section className="grid2">
          <div className="card today">
            <h2>📊 今日摸鱼战报</h2>
            <div className="today-money">¥ {fmtMoney(totalSlackEarned)}</div>
            <p className="today-note">
              {totalSlackEarned <= 0
                ? '今天还没开张，老板的血汗钱等你解放'
                : totalSlackEarned < 30
                  ? '小有收获，继续加油，别被发现'
                  : totalSlackEarned < 100
                    ? '战绩斐然，老板看了沉默，财务看了流泪'
                    : '今天血赚！建议低调，小心 HR 顺着网线来抓你'}
            </p>
          </div>
          <div className="card rank">
            <h2>🏆 摸鱼段位</h2>
            <div className="rank-main">
              <span className="rank-emoji">{level.emoji}</span>
              <div>
                <div className="rank-title">{level.title}</div>
                <div className="rank-desc">{level.desc}</div>
              </div>
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${levelProgress}%` }}></div>
            </div>
            <div className="rank-next">
              {nextLevel
                ? `再摸 ¥${fmtMoney(nextLevel.min - totalSlackEarned)} 晋级「${nextLevel.title}」${nextLevel.emoji}`
                : '已达最高境界，鱼见鱼低头 🐉'}
            </div>
          </div>
        </section>

        {/* 8. 摸鱼圣经 */}
        <section className="card bible">
          <h2>📖 摸鱼圣经</h2>
          <blockquote className="quote">“{quote}”</blockquote>
          <button className="btn b-purple" onClick={drawQuote}>
            🎲 再来一句
          </button>
        </section>

        <footer className="foot">
          <p>⚠️ 本计算器纯属打工人娱乐，摸鱼有风险，开摸需谨慎</p>
          <p>被老板抓到本站概不负责 · 所有数据纯本地保存，绝不上云</p>
        </footer>
      </main>

      {/* 9. 摸鱼操作模态框（实时开摸 or 快速补录） */}
      {modalCategory && (
        <div className="moyu-modal-backdrop" onClick={() => setModalCategory(null)}>
          <div className="moyu-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="m-emoji">{modalCategory.emoji}</div>
            <div className="m-title">{modalCategory.name}</div>
            <div className="m-desc">{modalCategory.desc}</div>

            <button className="modal-live-btn" onClick={startLiveSlack}>
              ⏱️ 实时开摸！（正向计时）
            </button>

            <div className="modal-divider">或者直接补录摸了多久</div>

            <div className="modal-quick-presets">
              {[5, 10, 15, 30].map((m) => {
                const earn = m * 60 * rates.perSecond
                return (
                  <button
                    key={m}
                    className="quick-chip"
                    onClick={() => handleQuickRecord(m)}
                  >
                    <span>摸了 {m} 分钟</span>
                    <span className="qc-earn">+¥{fmtMoney(earn)}</span>
                  </button>
                )
              })}
            </div>

            <div className="modal-custom-row">
              <input
                type="number"
                placeholder="分钟"
                min="1"
                max="480"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
              />
              <span style={{ fontWeight: 800, fontSize: 14 }}>分钟</span>
              <button
                className="modal-record-btn"
                onClick={() => {
                  const num = parseFloat(customMin)
                  if (num > 0) handleQuickRecord(num)
                  else alert('请输入有效的摸鱼分钟数～')
                }}
              >
                记上一笔
              </button>
            </div>
            {parseFloat(customMin) > 0 && (
              <div style={{ fontSize: 13, fontWeight: 900, color: '#0b6b28', marginTop: 8 }}>
                预计白嫖收益：+¥{fmtMoney(parseFloat(customMin) * 60 * rates.perSecond)}
              </div>
            )}

            {/* 3. 自定义上班时段精确补录（严格限制在上班时间范围内，超出上班时间根本没有选项，无法选中） */}
            <div
              style={{
                marginTop: 14,
                padding: '12px 10px',
                background: '#fffdf0',
                border: '2px dashed var(--black)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 900 }}>🕒 工作时段精确补录</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#ff0055' }}>
                  仅限上班时间: {settings.workStart} ~ {settings.workEnd}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#666' }}>开始时间（上班中）</span>
                  <select
                    value={periodStart}
                    onChange={(e) => {
                      const newStart = e.target.value
                      setPeriodStart(newStart)
                      if (periodEnd && periodEnd <= newStart) {
                        const nextSlot = workTimeSlots.find((t) => t > newStart)
                        if (nextSlot) setPeriodEnd(nextSlot)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 6px',
                      border: '2px solid var(--black)',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 13,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {validStartSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>

                <span style={{ fontWeight: 900, fontSize: 13, marginTop: 14 }}>至</span>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#666' }}>结束时间（上班中）</span>
                  <select
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 6px',
                      border: '2px solid var(--black)',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 13,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {validEndSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handlePeriodRecord}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--yellow)',
                    border: '2px solid var(--black)',
                    borderRadius: 8,
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: '2px 2px 0 var(--black)',
                    whiteSpace: 'nowrap',
                    marginTop: 14,
                  }}
                >
                  确定补录
                </button>
              </div>

              {periodMinutes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 900, marginTop: 4 }}>
                  <span style={{ color: '#444' }}>选定时长: {periodMinutes} 分钟</span>
                  <span style={{ color: '#0b6b28' }}>预计白嫖: +¥{fmtMoney(periodMinutes * 60 * rates.perSecond)}</span>
                </div>
              )}
            </div>

            <button className="modal-cancel-btn" onClick={() => setModalCategory(null)}>
              暂不开摸，撤回
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

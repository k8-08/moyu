import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import '../App.css'
import TimePicker from '../components/TimePicker'
import { authApi, profileApi, recordsApi, salaryApi, type UserInfo } from '../api/client'
import { showToast } from '../components/ui/Toast'
import ConfirmModal from '../components/ui/ConfirmModal'
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
      // 若已登录，同步到云端打工档案并联动刷新今日出勤底薪
      if (localStorage.getItem('moyu_token')) {
        const sal = parseFloat(next.salary) || 0
        const days = parseFloat(next.workDays) || 21.75
        const newDailyBase = Number((sal / days).toFixed(2))

        profileApi.update({
          salary: sal,
          work_days: days,
          work_start: next.workStart,
          work_end: next.workEnd,
          lunch_start: next.lunchStart,
          lunch_end: next.lunchEnd,
        }).then(() => {
          // 联动上报今日工资快照
          const sumEarn = records.reduce((s, r) => s + r.earned, 0)
          const sumDur = records.reduce((s, r) => s + r.duration, 0)
          salaryApi.reportToday({
            date: getTodayStr(),
            base_salary: newDailyBase,
            slack_salary: Number(sumEarn.toFixed(2)),
            total_salary: Number((newDailyBase + sumEarn).toFixed(2)),
            slack_count: records.length,
            slack_duration: Math.round(sumDur),
          }).catch(() => {})
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
  const [modalTab, setModalTab] = useState<'live' | 'record'>('live')
  const [customMin, setCustomMin] = useState<number | string>(15)
  const [periodStart, setPeriodStart] = useState<string>('09:00')
  const [periodEnd, setPeriodEnd] = useState<string>('09:30')

  // 确认操作弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    confirmVariant?: 'danger' | 'primary' | 'warning'
    onConfirm: () => void
  } | null>(null)

  // 页面挂载时：必须登录才能用，未登录不给试用，直接重定向至登录页
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

        // 1. 获取打工档案
        const p = await profileApi.get()
        if (p && p.salary) {
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

        // 2. 获取今日摸鱼记录（严格按今天拉取，历史数据不混入今天）
        const todayStr = getTodayStr()
        const cloudRecs = await recordsApi.getToday(todayStr)
        if (cloudRecs && Array.isArray(cloudRecs)) {
          const parseTs = (val: any) => {
            if (typeof val === 'number') return val
            const d = new Date(String(val).replace(' ', 'T'))
            return isNaN(d.getTime()) ? Date.now() : d.getTime()
          }
          const mapped: SlackRecord[] = cloudRecs.map((r) => ({
            id: r.id,
            categoryId: r.category_id as any,
            startTime: parseTs(r.start_time),
            endTime: parseTs(r.end_time),
            duration: r.duration,
            earned: r.earned,
          }))
          setRecords(mapped)
          saveRecordsToStorage(mapped)
        }
      } catch (e) {
        console.warn('Init user session failed, redirecting to login', e)
        localStorage.removeItem('moyu_token')
        setUser(null)
        navigate('/login', { replace: true })
      }
    }
    initCloudData()
  }, [navigate])


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
      showToast.warning('⚠️ 请先在打工档案中输入你的月薪，有了家底才好开始摸鱼变现～')
      return
    }

    if (activeSlack) {
      if (activeSlack.categoryId === cat.id) {
        showToast.info(`你当前已经在「${cat.name}」中啦，正在持续白嫖中！`)
        return
      }
      const activeCat = SLACK_CATEGORIES.find((c) => c.id === activeSlack.categoryId)
      setConfirmModal({
        isOpen: true,
        title: '🔄 切换摸鱼姿势',
        message: `你当前正在进行「${activeCat?.name || '摸鱼'}」，确定要先结束并切换到「${cat.name}」吗？\n（当前摸鱼将自动结账归档入账）`,
        confirmText: '结账并切换',
        confirmVariant: 'warning',
        onConfirm: () => {
          endActiveSlack()
          setConfirmModal(null)
          openCategoryModal(cat)
        },
      })
      return
    }

    openCategoryModal(cat)
  }

  // 打开分类操作弹窗
  const openCategoryModal = (cat: SlackCategory) => {
    setModalCategory(cat)
    setModalTab('live')
    setCustomMin(15)

    // 初始化时段：默认选取上班时间范围内的合法时段
    const nowH = now.getHours()
    const nowM = now.getMinutes()
    const nowTotal = nowH * 60 + nowM
    const [sH, sM] = settings.workStart.split(':').map(Number)
    const [eH, eM] = settings.workEnd.split(':').map(Number)
    const startTotal = sH * 60 + sM
    const endTotal = eH * 60 + eM

    const pad = (n: number) => String(n).padStart(2, '0')

    if (nowTotal >= startTotal + 10 && nowTotal <= endTotal) {
      const endSlotM = Math.min(endTotal, nowTotal)
      const startSlotM = Math.max(startTotal, endSlotM - 20)
      setPeriodStart(`${pad(Math.floor(startSlotM / 60))}:${pad(startSlotM % 60)}`)
      setPeriodEnd(`${pad(Math.floor(endSlotM / 60))}:${pad(endSlotM % 60)}`)
    } else {
      const defaultEndM = Math.min(endTotal, startTotal + 30)
      setPeriodStart(settings.workStart)
      setPeriodEnd(`${pad(Math.floor(defaultEndM / 60))}:${pad(defaultEndM % 60)}`)
    }
  }

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
    showToast.success(`⏱️ 「${modalCategory.name}」正向开摸！计时已开启，每一秒都是纯收益～`)
  }

  // 辅助：向后端上报并汇总今日工资表
  const syncDailySalaryReport = useCallback(
    (currentRecords: SlackRecord[], currentSlackEarned: number, currentSlackDuration: number) => {
      if (!localStorage.getItem('moyu_token')) return
      const baseEarn = rates.perDay
      salaryApi
        .reportToday({
          date: getTodayStr(),
          base_salary: baseEarn,
          slack_salary: Number(currentSlackEarned.toFixed(2)),
          total_salary: Number((baseEarn + currentSlackEarned).toFixed(2)),
          slack_count: currentRecords.length,
          slack_duration: Math.round(currentSlackDuration),
        })
        .catch((err) => console.error('Failed to report daily salary', err))
    },
    [rates.perDay]
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
      showToast.warning(`当前时间还没到上班时间（${settings.workStart}）哦！带薪摸鱼只能在上班期间进行～`)
      return
    }

    // 确定结束时间（上限不得超过下班时间 settings.workEnd）
    const endMin = Math.min(nowTotalMin, endWorkMin)
    // 确定开始时间（下限不得早于上班时间 settings.workStart）
    const startMin = Math.max(startWorkMin, endMin - minutes)

    const actualMinutes = endMin - startMin
    if (actualMinutes <= 0) {
      showToast.warning(`所选时间超出了上班范围（${settings.workStart} ~ ${settings.workEnd}），无法生成有效摸鱼记录！`)
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

    const catName = modalCategory.name
    setModalCategory(null)
    await commitRecord(newRec)
    showToast.success(`🕒 成功补录「${catName}」${actualMinutes}分钟，白嫖 ¥${fmtMoney(earn)}！`)
  }

  // 统一提交摸鱼记录并同步云端权威计算结果
  const commitRecord = async (newRec: SlackRecord) => {
    setRecords((prev) => {
      const updated = [newRec, ...prev]
      saveRecordsToStorage(updated)
      return updated
    })

    if (localStorage.getItem('moyu_token')) {
      try {
        const res = await recordsApi.create({
          id: newRec.id,
          category_id: newRec.categoryId,
          start_time: newRec.startTime,
          end_time: newRec.endTime,
          duration: newRec.duration,
          earned: newRec.earned,
        })
        if (res && res.earned !== undefined) {
          setRecords((prev) => {
            const next = prev.map((r) => (r.id === newRec.id ? { ...r, earned: res.earned, duration: res.duration } : r))
            saveRecordsToStorage(next)
            return next
          })
        }
      } catch (e) {
        console.error('Failed to sync record to cloud', e)
      }
    }
  }

  // 补录自定义时段摸鱼（严格限制在上班时间段 settings.workStart ~ settings.workEnd 之内）
  const handlePeriodRecord = async () => {
    if (!modalCategory) return
    if (!periodStart || !periodEnd) {
      showToast.warning('请完整选择摸鱼开始时间与结束时间！')
      return
    }

    if (periodStart < settings.workStart || periodEnd > settings.workEnd) {
      showToast.warning(`摸鱼时段只能在上班时间（${settings.workStart} ~ ${settings.workEnd}）内哦！`)
      return
    }

    if (periodStart >= periodEnd) {
      showToast.warning('摸鱼开始时间必须早于结束时间！')
      return
    }

    const [sH, sM] = periodStart.split(':').map(Number)
    const [eH, eM] = periodEnd.split(':').map(Number)
    const durationMinutes = (eH * 60 + eM) - (sH * 60 + sM)

    if (durationMinutes <= 0) {
      showToast.warning('摸鱼时长必须大于 0 分钟！')
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

    const catName = modalCategory.name
    setModalCategory(null)
    await commitRecord(newRec)
    showToast.success(`🕒 成功补录「${catName}」${durationMinutes}分钟，入账 ¥${fmtMoney(earn)}！`)
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

    const catName = activeCategory?.name || '摸鱼'
    setActiveSlack(null)
    saveActiveSlackToStorage(null)
    await commitRecord(newRec)
    showToast.success(`🏃 「${catName}」收工结账！累计白嫖 ${fmtDurationShort(elapsed)}，到手 ¥${fmtMoney(earned)}！`)
  }

  // 销毁单条罪证
  const handleDeleteRecord = (rec: SlackRecord) => {
    const confirmMsg =
      DELETE_CONFIRM_MESSAGES[rec.categoryId] ||
      `确定要销毁这条摸鱼记录吗？\n价值 ¥${fmtMoney(rec.earned)} 的白嫖收益将被抹去！`

    setConfirmModal({
      isOpen: true,
      title: '🗑️ 销毁摸鱼罪证',
      message: confirmMsg,
      confirmText: '销毁罪证',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModal(null)
        const updated = records.filter((r) => r.id !== rec.id)
        setRecords(updated)
        saveRecordsToStorage(updated)
        showToast.info('🗑️ 罪证已成功销毁，神不知鬼不觉～')

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
      },
    })
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 900, background: '#fff', border: '2px solid var(--black)', padding: '3px 8px', borderRadius: 8, boxShadow: '2px 2px 0 var(--black)' }}>
                  🔒 登录鉴权中...
                </span>
              </div>
              <Link to="/login" className="auth-btn login-btn" style={{ padding: '5px 14px', fontSize: 13 }}>
                🔑 去登录 / 注册
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
          <div style={{ fontSize: 12, fontWeight: 800, color: '#555', marginBottom: 4 }}>
            💼 今日出勤劳动已赚（秒级实时变现）
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
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginTop: 6 }}>
            ⚡ 当前秒薪：¥{rates.perSecond.toFixed(4)}/秒 • 已赚金额随时间持续跳动跳现
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
          <p>🛡️ 本地免登录即开即用 · 登录后支持多端无缝云端存证与老板监控大盘同步</p>
        </footer>
      </main>

      {/* 9. 摸鱼操作模态框（双 Tab 结构清晰拆分：实时开摸 or 快速补录） */}
      {modalCategory && (
        <div className="moyu-modal-backdrop" onClick={() => setModalCategory(null)}>
          <div className="moyu-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="m-emoji">{modalCategory.emoji}</div>
            <div className="m-title">{modalCategory.name}</div>
            <div className="m-desc">{modalCategory.desc}</div>

            {/* 双模式 Tab 切换 */}
            <div
              style={{
                display: 'flex',
                border: '3px solid var(--black)',
                borderRadius: 12,
                overflow: 'hidden',
                margin: '10px 0 16px',
                background: '#fff',
              }}
            >
              <button
                type="button"
                onClick={() => setModalTab('live')}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontWeight: 900,
                  fontSize: 14,
                  background: modalTab === 'live' ? 'var(--yellow)' : '#fff',
                  border: 'none',
                  borderRight: '2px solid var(--black)',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                ⏱️ 实时正向开摸
              </button>
              <button
                type="button"
                onClick={() => setModalTab('record')}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontWeight: 900,
                  fontSize: 14,
                  background: modalTab === 'record' ? 'var(--yellow)' : '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                🕒 补录摸鱼时长
              </button>
            </div>

            {/* TAB 1: 实时正向开摸 */}
            {modalTab === 'live' && (
              <div style={{ padding: '6px 0' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>
                  人在工位心在外，每一秒都在带薪变现！<br />
                  点击立即启动计时，随时可收工结账入账。
                </p>
                <button className="modal-live-btn" onClick={startLiveSlack} style={{ fontSize: 17, padding: '14px' }}>
                  🚀 启动「{modalCategory.name}」正向计时！
                </button>
              </div>
            )}

            {/* TAB 2: 补录时长（0-60分钟自由微调 + 工作时段精确补录） */}
            {modalTab === 'record' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#666', marginBottom: 8, textAlign: 'left' }}>
                  ⚡ 常用快捷时长录入：
                </div>
                <div className="modal-quick-presets">
                  {[5, 10, 15, 20, 30, 45, 60].map((m) => {
                    const earn = m * 60 * rates.perSecond
                    return (
                      <button
                        key={m}
                        className="quick-chip"
                        onClick={() => handleQuickRecord(m)}
                        title={`快捷录入 ${m} 分钟`}
                      >
                        <span>{m} 分钟</span>
                        <span className="qc-earn">+¥{fmtMoney(earn)}</span>
                      </button>
                    )
                  })}
                </div>

                {/* 0-60 分钟自由微调与滑块 */}
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '2px solid var(--black)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#444' }}>🎛️ 自由调节时长 (0-60分钟)：</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--black)' }}>
                      <strong>{Number(customMin) || 0}</strong> 分钟
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="60"
                    value={Math.min(60, Math.max(1, Number(customMin) || 1))}
                    onChange={(e) => setCustomMin(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--black)', cursor: 'pointer', margin: '4px 0' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => setCustomMin((prev) => Math.max(1, (Number(prev) || 0) - 5))}
                        style={{ padding: '4px 8px', border: '2px solid var(--black)', borderRadius: 6, background: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 11 }}
                      >
                        -5分
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMin((prev) => Math.max(1, (Number(prev) || 0) - 1))}
                        style={{ padding: '4px 8px', border: '2px solid var(--black)', borderRadius: 6, background: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 11 }}
                      >
                        -1分
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMin((prev) => Math.min(480, (Number(prev) || 0) + 1))}
                        style={{ padding: '4px 8px', border: '2px solid var(--black)', borderRadius: 6, background: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 11 }}
                      >
                        +1分
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMin((prev) => Math.min(480, (Number(prev) || 0) + 5))}
                        style={{ padding: '4px 8px', border: '2px solid var(--black)', borderRadius: 6, background: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 11 }}
                      >
                        +5分
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min="1"
                        max="480"
                        value={customMin}
                        onChange={(e) => setCustomMin(e.target.value)}
                        style={{
                          width: 60,
                          padding: '4px 6px',
                          border: '2px solid var(--black)',
                          borderRadius: 6,
                          fontWeight: 900,
                          textAlign: 'center',
                          fontSize: 13,
                        }}
                      />
                      <button
                        type="button"
                        className="modal-record-btn"
                        onClick={() => {
                          const num = parseFloat(String(customMin))
                          if (num > 0) handleQuickRecord(num)
                          else showToast.warning('请输入大于 0 的有效摸鱼分钟数～')
                        }}
                        style={{ padding: '6px 12px', fontSize: 13 }}
                      >
                        记上一笔
                      </button>
                    </div>
                  </div>

                  {parseFloat(String(customMin)) > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#0b6b28', marginTop: 8, textAlign: 'right' }}>
                      预计白嫖收益：+¥{fmtMoney(parseFloat(String(customMin)) * 60 * rates.perSecond)}
                    </div>
                  )}
                </div>

                {/* 工作时段精确补录（抛弃长select，改用规范time input） */}
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
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>🕒 工作时段精确补录</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#ff0055', background: '#ffe4e6', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--black)' }}>
                      🏢 基线范围: {settings.workStart} ~ {settings.workEnd}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#666' }}>开始时间</span>
                      <input
                        type="time"
                        value={periodStart}
                        min={settings.workStart}
                        max={settings.workEnd}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '2px solid var(--black)',
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 14,
                          background: '#fff',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <span style={{ fontWeight: 900, fontSize: 14, marginTop: 16 }}>至</span>

                    <div style={{ flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#666' }}>结束时间</span>
                      <input
                        type="time"
                        value={periodEnd}
                        min={settings.workStart}
                        max={settings.workEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '2px solid var(--black)',
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 14,
                          background: '#fff',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handlePeriodRecord}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--yellow)',
                        border: '2px solid var(--black)',
                        borderRadius: 8,
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: 'pointer',
                        boxShadow: '2px 2px 0 var(--black)',
                        whiteSpace: 'nowrap',
                        marginTop: 16,
                      }}
                    >
                      确认补录
                    </button>
                  </div>

                  {/* 快捷基线辅助标签 */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setPeriodStart(settings.workStart)}
                      style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, border: '1px solid #999', background: '#fff', cursor: 'pointer' }}
                    >
                      🕒 开工点 ({settings.workStart})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date()
                        const pad = (n: number) => String(n).padStart(2, '0')
                        const curT = `${pad(d.getHours())}:${pad(d.getMinutes())}`
                        if (curT <= settings.workEnd && curT >= settings.workStart) {
                          setPeriodEnd(curT)
                        } else {
                          showToast.info(`当前时间（${curT}）不在上班时间内，已自动对齐下班点～`)
                          setPeriodEnd(settings.workEnd)
                        }
                      }}
                      style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, border: '1px solid #999', background: '#fff', cursor: 'pointer' }}
                    >
                      ⏱️ 对齐当前时间
                    </button>
                  </div>

                  {periodMinutes > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 900, marginTop: 4, background: '#fff', padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e0e0' }}>
                      <span style={{ color: '#444' }}>选定时长: {periodMinutes} 分钟</span>
                      <span style={{ color: '#0b6b28' }}>预计入账: +¥{fmtMoney(periodMinutes * 60 * rates.perSecond)}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#e11d48' }}>
                      ⚠️ 请确保开始时间早于结束时间，且在上班时段（{settings.workStart} ~ {settings.workEnd}）内！
                    </div>
                  )}
                </div>
              </div>
            )}

            <button className="modal-cancel-btn" onClick={() => setModalCategory(null)}>
              暂不开摸，关闭
            </button>
          </div>
        </div>
      )}

      {/* 10. 全局操作确认弹窗（替代系统级原生 confirm） */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          confirmVariant={confirmModal.confirmVariant}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}


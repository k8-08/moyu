export interface MoyuSettings {
  salary: string // 月薪
  workDays: string // 月工作天数，默认 21.75
  workStart: string // 上班时间，默认 '09:00'
  workEnd: string // 下班时间，默认 '18:00'
  lunchStart: string // 午休开始，默认 '12:00'
  lunchEnd: string // 午休结束，默认 '13:00'
}

export interface SlackCategory {
  id: string
  emoji: string
  name: string
  desc: string
}

export interface SlackRecord {
  id: string
  categoryId: string
  startTime: number
  endTime: number
  duration: number // 秒
  earned: number // 金额
}

export interface ActiveSlack {
  categoryId: string
  startTime: number
  date: string // YYYY-MM-DD
}

export const DEFAULT_SETTINGS: MoyuSettings = {
  salary: '10000',
  workDays: '21.75',
  workStart: '09:00',
  workEnd: '18:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
}

export const SLACK_CATEGORIES: SlackCategory[] = [
  { id: 'toilet', emoji: '🚽', name: '带薪拉屎', desc: '打工人的最后净土' },
  { id: 'chat', emoji: '💬', name: '吹水闲聊', desc: '群聊摸鱼八卦' },
  { id: 'phone', emoji: '📱', name: '带薪刷手机', desc: '朋友圈/小红书/微博' },
  { id: 'tea', emoji: '☕', name: '带薪茶歇', desc: '泡茶/咖啡/零食下楼' },
  { id: 'smoke', emoji: '🚬', name: '带薪抽烟', desc: '透气放空提神' },
  { id: 'shop', emoji: '🛒', name: '带薪网购', desc: '清空购物车与快递' },
  { id: 'zoneout', emoji: '😴', name: '带薪发呆', desc: '凝视屏幕假装思考' },
  { id: 'game', emoji: '🎮', name: '带薪游戏', desc: '偷偷手游扫雷下棋' },
]

export const DELETE_CONFIRM_MESSAGES: Record<string, string> = {
  toilet: '确定要冲掉这条带薪拉屎记录吗？💨\n罪证一旦销毁，这笔香喷喷的带薪收入就当没发生过…',
  chat: '这段吹水的记忆即将抹去 🤫\n就当大家今天从来没八卦过？',
  phone: '刷都刷了，真的要毁掉这条手机税罪证吗？📱\n销毁后不可撤销哦！',
  tea: '这杯带薪下午茶要倒掉吗？🍵\n白嫖的茶歇费即将被一笔勾销…',
  smoke: '这口带薪烟要随风飘散吗？🚬\n打工人的解压时刻即将销声匿迹…',
  shop: '清空购物车罪证？🛒\n带薪网购战果将被毁尸灭迹…',
  zoneout: '连发过的呆都要删？😴\n这可是大脑最具灵感的放空资产呀！',
  game: '这段游戏战绩要毁尸灭迹？🎮\n摸鱼局的高光时刻说没就没？',
}

export const QUOTES = [
  '上班只为下班，工资只为干饭',
  '摸鱼一时爽，一直摸鱼一直爽',
  '认真工作是劳动换取报酬，摸鱼才是赚钱',
  '带薪拉屎，是打工人最后的尊严',
  '老板画的饼太大，我得就着茶水消化',
  '只要胆子大，天天寒暑假',
  '工资是精神损失费，摸鱼是情绪价值',
  '人在工位坐，魂在马尔代夫',
  '摸鱼不是不努力，是在帮公司节省精力成本',
  '会摸鱼的员工，才是公司的固定资产',
  '带薪蹲坑十分钟，胜过下班两小时',
  '努力不一定会被看见，但休息一定会',
  '我不是在摸鱼，我是在给公司沉淀方法论',
  '上班不摸鱼，不如去种地',
]

export const ITEMS = [
  { emoji: '🧋', name: '奶茶', price: 18, unit: '杯' },
  { emoji: '🍗', name: '疯狂星期四', price: 50, unit: '份 V我50' },
  { emoji: '🍲', name: '火锅', price: 88, unit: '顿' },
  { emoji: '☕', name: '瑞幸 9.9', price: 9.9, unit: '杯' },
  { emoji: '🎮', name: '传说皮肤', price: 168, unit: '个' },
]

export const LEVELS = [
  { min: 0, emoji: '🐟', title: '鱼苗', desc: '刚下水，还在试探' },
  { min: 5, emoji: '🐠', title: '摸鱼学徒', desc: '初窥门径，渐入佳境' },
  { min: 15, emoji: '🐡', title: '熟练划水员', desc: '划水姿势标准优雅' },
  { min: 30, emoji: '🦈', title: '摸鱼达人', desc: '工位隐形，神出鬼没' },
  { min: 50, emoji: '🐋', title: '深海巨鲸', desc: '老板查岗都找不到你' },
  { min: 100, emoji: '🐉', title: '摸鱼龙王', desc: '带薪修炼，已臻化境' },
]

/* ------------ 计算工具函数 ------------ */

export function getWorkHours(settings: MoyuSettings): number {
  const [sh, sm] = (settings.workStart || '09:00').split(':').map(Number)
  const [eh, em] = (settings.workEnd || '18:00').split(':').map(Number)
  let totalMin = (eh * 60 + em) - (sh * 60 + sm)

  const [lh, lm] = (settings.lunchStart || '12:00').split(':').map(Number)
  const [leH, leM] = (settings.lunchEnd || '13:00').split(':').map(Number)
  const lunchMin = (leH * 60 + leM) - (lh * 60 + lm)
  if (lunchMin > 0) totalMin -= lunchMin

  return Math.max(0.1, totalMin / 60)
}

export function getRates(settings: MoyuSettings) {
  const salary = parseFloat(settings.salary) || 0
  const days = parseFloat(settings.workDays) || 21.75
  const hours = getWorkHours(settings)
  const totalSeconds = days * hours * 3600

  const perSecond = totalSeconds > 0 ? salary / totalSeconds : 0
  const perMinute = perSecond * 60
  const perHour = perSecond * 3600
  const perDay = days > 0 ? salary / days : 0

  return { perSecond, perMinute, perHour, perDay, workHours: hours }
}

export function getTotalWorkSeconds(settings: MoyuSettings): number {
  const [sh, sm] = (settings.workStart || '09:00').split(':').map(Number)
  const [eh, em] = (settings.workEnd || '18:00').split(':').map(Number)
  const [lh, lm] = (settings.lunchStart || '12:00').split(':').map(Number)
  const [leH, leM] = (settings.lunchEnd || '13:00').split(':').map(Number)

  const startSec = (sh * 60 + sm) * 60
  const endSec = (eh * 60 + em) * 60
  const lunchSec = Math.max(0, (leH * 60 + leM - (lh * 60 + lm)) * 60)

  return Math.max(60, endSec - startSec - lunchSec)
}

export function getWorkedSecondsToday(settings: MoyuSettings, now = new Date()): number {
  const [sh, sm] = (settings.workStart || '09:00').split(':').map(Number)
  const [eh, em] = (settings.workEnd || '18:00').split(':').map(Number)
  const [lh, lm] = (settings.lunchStart || '12:00').split(':').map(Number)
  const [leH, leM] = (settings.lunchEnd || '13:00').split(':').map(Number)

  const startSec = (sh * 60 + sm) * 60
  const endSec = (eh * 60 + em) * 60
  const lunchStartSec = (lh * 60 + lm) * 60
  const lunchEndSec = (leH * 60 + leM) * 60
  const nowSec = (now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()

  if (nowSec <= startSec) return 0

  const totalLunchSec = Math.max(0, lunchEndSec - lunchStartSec)
  const maxWorkSec = Math.max(0, endSec - startSec - totalLunchSec)

  if (nowSec >= endSec) {
    return maxWorkSec
  }

  let workedSec = nowSec - startSec
  if (nowSec > lunchStartSec) {
    const lunchElapsed = Math.min(nowSec, lunchEndSec) - lunchStartSec
    if (lunchElapsed > 0) workedSec -= lunchElapsed
  }

  return Math.min(maxWorkSec, Math.max(0, workedSec))
}

export function getRemainingWorkSeconds(settings: MoyuSettings, now = new Date()): number {
  const [eh, em] = (settings.workEnd || '18:00').split(':').map(Number)
  const [lh, lm] = (settings.lunchStart || '12:00').split(':').map(Number)
  const [leH, leM] = (settings.lunchEnd || '13:00').split(':').map(Number)

  const endSec = (eh * 60 + em) * 60
  const nowSec = (now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()
  if (nowSec >= endSec) return 0

  const lunchStartSec = (lh * 60 + lm) * 60
  const lunchEndSec = (leH * 60 + leM) * 60

  let remainingSec = endSec - nowSec
  if (nowSec < lunchStartSec) {
    remainingSec -= Math.max(0, lunchEndSec - lunchStartSec)
  } else if (nowSec < lunchEndSec) {
    remainingSec -= Math.max(0, lunchEndSec - nowSec)
  }

  return Math.max(0, remainingSec)
}

export function getStageText(pct: number): string {
  if (pct <= 0) return '新的一天，套上犁准备开干… 🐂'
  if (pct <= 10) return '刚上工，牛马精神抖擞！🐂✨'
  if (pct <= 25) return '埋头拉磨中，闲人勿扰… 🐂💨'
  if (pct <= 40) return '拉磨平稳，草料已在望 🌾'
  if (pct <= 50) return '过半啦！牛马生涯已熬过一半 🎯'
  if (pct <= 65) return '下午茶时间到，再撑一把 ☕'
  if (pct <= 80) return '胜利在望！缰绳已经松动 🏃‍♂️'
  if (pct <= 95) return '冲刺阶段！磨盘转冒火星子 🚀'
  if (pct < 100) return '最后一圈！准备卸磨！🎉'
  return '刑满释放！今天的粮票已白嫖到手 💰🎊'
}

export function fmtMoney(n: number, digits = 2): string {
  return n.toFixed(digits)
}

export function fmtDuration(sec: number): string {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const remSec = s % 60
  if (h > 0) return `${h}小时${m}分${remSec}秒`
  if (m > 0) return `${m}分${remSec}秒`
  return `${remSec}秒`
}

export function fmtDurationShort(sec: number): string {
  const s = Math.floor(sec)
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}小时${remM}分` : `${h}小时`
}

export function getWorkStatus(settings: MoyuSettings, now = new Date()) {
  const [sh, sm] = (settings.workStart || '09:00').split(':').map(Number)
  const [eh, em] = (settings.workEnd || '18:00').split(':').map(Number)
  const [lh, lm] = (settings.lunchStart || '12:00').split(':').map(Number)
  const [leH, leM] = (settings.lunchEnd || '13:00').split(':').map(Number)

  const curMin = now.getHours() * 60 + now.getMinutes()
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const lunchStartMin = lh * 60 + lm
  const lunchEndMin = leH * 60 + leM

  if (curMin < startMin) {
    return { status: 'before', label: '尚未上工', desc: '新的一天即将套上犁拉磨', cls: 'ws-before' }
  }
  if (curMin >= endMin) {
    return { status: 'off', label: '刑满释放', desc: '今天的工已打完，安心躺平', cls: 'ws-off' }
  }
  if (curMin >= lunchStartMin && curMin < lunchEndMin) {
    return { status: 'lunch', label: '法定午休中', desc: '工钱冻结养精蓄锐，放心干饭放空', cls: 'ws-lunch' }
  }
  return { status: 'working', label: '埋头拉磨中', desc: '每一秒都在稳定变现', cls: 'ws-working' }
}

export function fmtCountdown(sec: number): string {
  if (sec <= 0) return '已刑满释放 🎉'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const remSec = s % 60
  return [h, m, remSec].map((v) => String(v).padStart(2, '0')).join(':')
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import '../App.css'
import { adminApi, authApi, type DailySalaryRecord, type UserInfo, type AdminStatsData } from '../api/client'
import { showToast } from '../components/ui/Toast'

type TimeDimension = 'day' | 'week' | 'month' | 'year' | 'all'
type TabType = 'stats' | 'salaries' | 'records' | 'users'

export default function Admin() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [unauthorizedMsg, setUnauthorizedMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('stats')
  const [dimension, setDimension] = useState<TimeDimension>('day')

  // 看板统计数据
  const [statsData, setStatsData] = useState<AdminStatsData | null>(null)
  // 工资表流水
  const [salariesList, setSalariesList] = useState<DailySalaryRecord[]>([])
  // 摸鱼明细流水
  const [recordsList, setRecordsList] = useState<any[]>([])
  const [recordFilterUser, setRecordFilterUser] = useState<string>('')
  // 用户列表
  const [usersList, setUsersList] = useState<any[]>([])

  // 员工下钻状态
  const [drillUser, setDrillUser] = useState<any | null>(null)
  const [drillTab, setDrillTab] = useState<'salaries' | 'records'>('salaries')
  const [drillSalaries, setDrillSalaries] = useState<DailySalaryRecord[]>([])
  const [drillRecords, setDrillRecords] = useState<any[]>([])
  const [loadingDrill, setLoadingDrill] = useState(false)

  // 员工明细排序：'default' | 'slack_desc' | 'salary_desc'
  const [sortField, setSortField] = useState<'default' | 'slack_desc' | 'total_desc'>('slack_desc')

  // 1. 验证权限
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await authApi.getMe()
        if (user.role !== 'admin') {
          setUnauthorizedMsg('您的账号不是超级管理员或老板，无权查阅全员监控看板！')
          return
        }
        setCurrentUser(user)
      } catch (e) {
        setUnauthorizedMsg('请先使用管理员账号（默认账号：admin / 密码：admin123）登录！')
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  // 2. 加载当前维度统计
  const loadStats = useCallback(async (dim: TimeDimension) => {
    try {
      const data = await adminApi.getStats(dim)
      setStatsData(data)
    } catch (e) {
      console.error('Failed to load stats', e)
    }
  }, [])

  // 3. 加载工资流水
  const loadSalaries = useCallback(async () => {
    try {
      const data = await adminApi.getSalaries({ limit: 100 })
      setSalariesList(data)
    } catch (e) {
      console.error('Failed to load salaries', e)
    }
  }, [])

  // 4. 加载摸鱼罪证明细流水
  const loadRecords = useCallback(async (userId?: number) => {
    try {
      const data = await adminApi.getRecords({ limit: 100, user_id: userId })
      setRecordsList(data)
    } catch (e) {
      console.error('Failed to load records', e)
    }
  }, [])

  // 5. 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      const data = await adminApi.getUsers()
      setUsersList(data)
    } catch (e) {
      console.error('Failed to load users', e)
    }
  }, [])

  // 切换维度或 Tab 时加载
  useEffect(() => {
    if (!currentUser) return
    if (activeTab === 'stats') {
      loadStats(dimension)
    } else if (activeTab === 'salaries') {
      loadSalaries()
    } else if (activeTab === 'records') {
      loadRecords(recordFilterUser ? Number(recordFilterUser) : undefined)
    } else if (activeTab === 'users') {
      loadUsers()
    }
  }, [currentUser, activeTab, dimension, recordFilterUser, loadStats, loadSalaries, loadRecords, loadUsers])

  // 下钻查看员工具体流水（联动加载每日工资快照与摸鱼明细）
  const handleDrillEmployee = async (u: any) => {
    setDrillUser(u)
    setDrillTab('salaries')
    setLoadingDrill(true)
    try {
      const [salRes, recRes] = await Promise.all([
        adminApi.getSalaries({ user_id: u.user_id, limit: 30 }),
        adminApi.getRecords({ user_id: u.user_id, limit: 50 }),
      ])
      setDrillSalaries(salRes)
      setDrillRecords(recRes)
    } catch (e) {
      showToast.error('获取该员工流水详情失败')
    } finally {
      setLoadingDrill(false)
    }
  }

  const handleLogout = () => {
    authApi.logout()
    showToast.info('已安全退出管理员账号')
    navigate('/login')
  }

  const formatMoney = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00'
    return Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDuration = (sec?: number) => {
    if (!sec) return '0秒'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const parts = []
    if (h > 0) parts.push(h + '小时')
    if (m > 0) parts.push(m + '分')
    if (s > 0 || parts.length === 0) parts.push(s + '秒')
    return parts.join(' ')
  }

  if (loading) {
    return (
      <div className="moyu-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h2>⏳ 正在验证管理权限...</h2>
        </div>
      </div>
    )
  }

  if (unauthorizedMsg || !currentUser || currentUser.role !== 'admin') {
    return (
      <div className="moyu-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
        <div className="card" style={{ maxWidth: 460, width: '100%', textAlign: 'center', padding: '36px 24px', background: '#fff' }}>
          <div style={{ fontSize: 50, marginBottom: 8 }}>🚫</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px' }}>管理权限拦截</h2>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#555', lineHeight: 1.5, margin: '0 0 24px' }}>
            {unauthorizedMsg || '只有超级管理员/老板账号才能进入全员监控大盘！'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link
              to="/"
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: '2px solid var(--black)',
                background: '#f0f0f0',
                color: 'var(--black)',
                fontWeight: 900,
                textDecoration: 'none',
                boxShadow: '2px 2px 0 var(--black)',
              }}
            >
              🐟 返回工位大厅
            </Link>
            <Link
              to="/login?redirect=/admin"
              className="auth-btn login-btn"
              style={{
                flex: 1,
                padding: '10px 0',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              🔑 管理员登录
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const dimNames: Record<TimeDimension, string> = {
    day: '📅 今天',
    week: '📆 本周',
    month: '🗓️ 本月',
    year: '📈 本年',
    all: '🌐 历史总览',
  }


  return (
    <div className="moyu-page">
      {/* 顶部跑马灯 */}
      <div className="ticker">
        <div className="ticker-inner">
          <span>👑 管理监控看板已接入 • 实时掌握全体打工人出勤工资与摸鱼收成 • 拒绝被资本家反向PUA • </span>
          <span>👑 管理监控看板已接入 • 实时掌握全体打工人出勤工资与摸鱼收成 • 拒绝被资本家反向PUA • </span>
        </div>
      </div>

      <main className="container" style={{ maxWidth: 1060 }}>
        {/* 顶栏控制条 */}
        <header className="hero" style={{ padding: '24px 0 16px' }}>
          <div className="badge">老板查岗 & 摸鱼监督总指挥部</div>
          <h1 style={{ fontSize: 32, margin: '8px 0' }}>
            👑 后台<span className="hl">管理看板</span>
          </h1>
          <p className="sub" style={{ margin: 0 }}>
            当前管理员：<strong>{currentUser?.nickname || currentUser?.username}</strong>（已连接本地 MySQL 数据库）
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14 }}>
            <Link to="/" className="auth-btn login-btn">
              🐟 返回摸鱼主站
            </Link>
            <button onClick={handleLogout} className="auth-btn logout-btn">
              🚪 退出登录
            </button>
          </div>
        </header>

        {/* Tab 导航栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setActiveTab('stats')}
              className="auth-btn"
              style={{ background: activeTab === 'stats' ? 'var(--yellow)' : '#fff' }}
            >
              📊 多维数据看板
            </button>
            <button
              onClick={() => setActiveTab('salaries')}
              className="auth-btn"
              style={{ background: activeTab === 'salaries' ? 'var(--yellow)' : '#fff' }}
            >
              💵 每日工资表流水 ({salariesList.length})
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className="auth-btn"
              style={{ background: activeTab === 'records' ? 'var(--yellow)' : '#fff' }}
            >
              🐟 摸鱼罪证流水 ({recordsList.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className="auth-btn"
              style={{ background: activeTab === 'users' ? 'var(--yellow)' : '#fff' }}
            >
              👥 打工人账号档案 ({usersList.length})
            </button>
          </div>

          {/* 只有在统计看板 Tab 下才展示时间维度选择 */}
          {activeTab === 'stats' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['day', 'week', 'month', 'year', 'all'] as TimeDimension[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDimension(d)}
                  className="auth-btn"
                  style={{
                    background: dimension === d ? 'var(--green)' : '#fff',
                    padding: '4px 10px',
                    fontSize: 12,
                  }}
                >
                  {dimNames[d]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: 数据分析看板 */}
        {activeTab === 'stats' && statsData && (
          <div>
            {/* 核心指标 5 大卡片 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>💰 实发总工资</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--black)', marginTop: 4 }}>
                  ¥{formatMoney(statsData.summary?.total_earned || 0)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>出勤 + 摸鱼已赚收益</div>
              </div>

              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>🛠️ 出勤基本工资</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#2b7fff', marginTop: 4 }}>
                  ¥{formatMoney(statsData.summary?.total_base_salary || 0)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>按工时出勤计费</div>
              </div>

              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>🐟 摸鱼白嫖工资</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#00c853', marginTop: 4 }}>
                  ¥{formatMoney(statsData.summary?.total_slack_salary || 0)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>白嫖公司纯利润</div>
              </div>

              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>⏱️ 摸鱼总时长</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--black)', marginTop: 6 }}>
                  {formatDuration(statsData.summary?.total_slack_duration || 0)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>全员累计开小差</div>
              </div>

              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#666' }}>🎯 摸鱼总频次</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#ff5a5a', marginTop: 4 }}>
                  {statsData.summary?.total_slack_count || 0} <span style={{ fontSize: 14 }}>次</span>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>在册员工 {usersList.length} 人</div>
              </div>
            </div>

            {/* 中间插入：打工人多维数据详细表格 */}
            <div
              className="card"
              style={{
                background: '#fff',
                border: '3px solid var(--black)',
                boxShadow: '4px 4px 0 var(--black)',
                padding: 20,
                marginBottom: 20,
                overflowX: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                    👥 员工明细数据看板（{dimNames[dimension]}）
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#666' }}>
                    按所选时间范围实时汇总每位员工的出勤与摸鱼数据，支持下钻查看个人流水
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>排序：</span>
                  <button
                    type="button"
                    onClick={() => setSortField('slack_desc')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '2px solid var(--black)',
                      background: sortField === 'slack_desc' ? 'var(--yellow)' : '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🔥 摸鱼最多
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortField('total_desc')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '2px solid var(--black)',
                      background: sortField === 'total_desc' ? 'var(--yellow)' : '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    💰 实发最高
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortField('default')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '2px solid var(--black)',
                      background: sortField === 'default' ? 'var(--yellow)' : '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    默认
                  </button>
                </div>
              </div>

              {statsData.user_details && statsData.user_details.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--yellow)', borderBottom: '3px solid var(--black)' }}>
                      <th style={{ padding: '10px 8px' }}>打工人</th>
                      <th style={{ padding: '10px 8px' }}>月薪档案</th>
                      <th style={{ padding: '10px 8px' }}>工作时段</th>
                      <th style={{ padding: '10px 8px' }}>出勤基本工资</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼白嫖收益</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼时长</th>
                      <th style={{ padding: '10px 8px' }}>摸鱼频次</th>
                      <th style={{ padding: '10px 8px' }}>已赚实发总额</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>数据下钻</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sortField === 'slack_desc'
                      ? [...statsData.user_details].sort((a, b) => (Number(b.slack_salary) || 0) - (Number(a.slack_salary) || 0))
                      : sortField === 'total_desc'
                      ? [...statsData.user_details].sort((a, b) => (Number(b.total_salary) || 0) - (Number(a.total_salary) || 0))
                      : statsData.user_details
                    ).map((u: any) => (
                      <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                            onClick={() => handleDrillEmployee(u)}
                            title="点击查看该打工人流水"
                          >
                            <span>👤</span>
                            <div>
                              <div style={{ fontWeight: 900, textDecoration: 'underline' }}>{u.nickname || u.username}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 800 }}>¥{formatMoney(u.salary)}</td>
                        <td style={{ padding: '10px 8px', fontSize: 12 }}>{u.work_hours}</td>
                        <td style={{ padding: '10px 8px', color: '#2b7fff' }}>¥{formatMoney(u.base_salary)}</td>
                        <td style={{ padding: '10px 8px', color: '#00c853', fontWeight: 900 }}>
                          ¥{formatMoney(u.slack_salary)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{formatDuration(u.slack_duration)}</td>
                        <td style={{ padding: '10px 8px' }}>{u.slack_count} 次</td>
                        <td style={{ padding: '10px 8px', fontWeight: 900, color: 'var(--black)', fontSize: 14 }}>
                          ¥{formatMoney(u.total_salary)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDrillEmployee(u)}
                            style={{
                              padding: '3px 8px',
                              background: '#fff',
                              border: '2px solid var(--black)',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 900,
                              cursor: 'pointer',
                              boxShadow: '1px 1px 0 var(--black)',
                            }}
                          >
                            🔍 查流水
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>暂无员工详细数据</div>
              )}
            </div>


            {/* 下半部分：摸鱼榜单与分类 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {/* 摸鱼战神英雄榜 */}
              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 18 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 900 }}>🏆 摸鱼战神白嫖榜 (TOP 10)</h3>
                {(statsData.leaderboard || statsData.hero_rankings) && (statsData.leaderboard || statsData.hero_rankings).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(statsData.leaderboard || statsData.hero_rankings).map((hero: any, idx: number) => (
                      <div
                        key={hero.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: idx === 0 ? 'var(--yellow)' : idx === 1 ? '#ff7ac8' : idx === 2 ? '#6cb8ff' : '#f5f5f5',
                          border: '2px solid var(--black)',
                          borderRadius: 8,
                          fontWeight: 800,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1)}
                          </span>
                          <span>{hero.nickname || hero.username}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--black)', fontSize: 14 }}>¥{formatMoney(hero.slack_salary ?? hero.total_slack_salary ?? hero.earned)}</div>
                          <div style={{ fontSize: 11, color: '#555' }}>{formatDuration(hero.slack_duration ?? hero.total_slack_duration ?? hero.duration)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>当前周期暂无摸鱼战绩，大家都在拼命拉磨！</div>
                )}
              </div>

              {/* 摸鱼类型分布 */}
              <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 18 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 900 }}>📊 热门摸鱼姿势排行榜</h3>
                {(statsData.category_ranks || statsData.category_stats) && (statsData.category_ranks || statsData.category_stats).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(statsData.category_ranks || statsData.category_stats).map((cat: any) => {
                      const catNames: Record<string, string> = {
                        toilet: '🚽 带薪拉屎',
                        game: '🎮 摸鱼开黑',
                        phone: '📱 刷短视频',
                        chat: '💬 假装对齐',
                        tea: '☕ 咖啡续命',
                        smoke: '🚬 楼道透气',
                        shop: '🛒 拼多多清购物车',
                        zoneout: '🧘 灵魂出窍',
                      }
                      return (
                        <div
                          key={cat.category_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: '#fdf0d5',
                            border: '2px solid var(--black)',
                            borderRadius: 8,
                            fontWeight: 800,
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 14 }}>{catNames[cat.category_id] || cat.category_id}</span>
                            <span style={{ fontSize: 12, marginLeft: 8, color: '#666' }}>({cat.count} 次)</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#00c853', fontSize: 14 }}>¥{formatMoney(cat.earned || cat.total_earned)}</div>
                            <div style={{ fontSize: 11, color: '#666' }}>{formatDuration(cat.duration || cat.total_duration)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>当前时间段暂无分类摸鱼数据</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 每日工资表流水 (daily_salaries) */}
        {activeTab === 'salaries' && (
          <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 20, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>💵 每日工资表快照 (`daily_salaries`)</h3>
              <button onClick={loadSalaries} className="auth-btn login-btn" style={{ fontSize: 12, padding: '4px 10px' }}>
                🔄 刷新
              </button>
            </div>

            {salariesList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>暂无每日工资快照数据，员工打工并摸鱼后将自动按日生成！</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--yellow)', borderBottom: '3px solid var(--black)' }}>
                    <th style={{ padding: '10px 8px' }}>日期</th>
                    <th style={{ padding: '10px 8px' }}>打工人</th>
                    <th style={{ padding: '10px 8px' }}>时间维度</th>
                    <th style={{ padding: '10px 8px' }}>出勤基本工资</th>
                    <th style={{ padding: '10px 8px' }}>摸鱼白嫖工资</th>
                    <th style={{ padding: '10px 8px' }}>当日已赚总额</th>
                    <th style={{ padding: '10px 8px' }}>摸鱼频次</th>
                    <th style={{ padding: '10px 8px' }}>摸鱼时长</th>
                  </tr>
                </thead>
                <tbody>
                  {salariesList.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px 8px' }}>{row.date}</td>
                      <td style={{ padding: '10px 8px' }}>{row.user_nickname || row.user_username || '#' + row.user_id}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                          {row.year}年 / {row.month}月 / 第{row.week}周
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: '#2b7fff' }}>¥{formatMoney(row.base_salary)}</td>
                      <td style={{ padding: '10px 8px', color: '#00c853' }}>¥{formatMoney(row.slack_salary)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 900 }}>¥{formatMoney(row.total_salary)}</td>
                      <td style={{ padding: '10px 8px' }}>{row.slack_count} 次</td>
                      <td style={{ padding: '10px 8px' }}>{formatDuration(row.slack_duration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: 摸鱼罪证记录明细 (slack_records) */}
        {activeTab === 'records' && (
          <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 20, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>🐟 摸鱼罪证流水明细 (`slack_records`)</h3>
                <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>查阅全员每一笔具体的摸鱼变现时间与姿势</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={recordFilterUser}
                  onChange={(e) => setRecordFilterUser(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: '2px solid var(--black)',
                    borderRadius: 6,
                    fontWeight: 800,
                    fontSize: 12,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">👤 全部打工人</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname || u.username} (#{u.id})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => loadRecords(recordFilterUser ? Number(recordFilterUser) : undefined)}
                  className="auth-btn login-btn"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  🔄 刷新
                </button>
              </div>
            </div>

            {recordsList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>当前暂无符合条件的摸鱼罪证记录</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--yellow)', borderBottom: '3px solid var(--black)' }}>
                    <th style={{ padding: '10px 8px' }}>日期</th>
                    <th style={{ padding: '10px 8px' }}>打工人</th>
                    <th style={{ padding: '10px 8px' }}>摸鱼姿势</th>
                    <th style={{ padding: '10px 8px' }}>起止时段</th>
                    <th style={{ padding: '10px 8px' }}>持续时长</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>白嫖收益</th>
                  </tr>
                </thead>
                <tbody>
                  {recordsList.map((rec) => {
                    const catNames: Record<string, string> = {
                      toilet: '🚽 带薪拉屎',
                      game: '🎮 摸鱼开黑',
                      phone: '📱 刷短视频',
                      chat: '💬 假装对齐',
                      tea: '☕ 咖啡续命',
                      smoke: '🚬 楼道透气',
                      shop: '🛒 拼多多清购物车',
                      zoneout: '🧘 灵魂出窍',
                    }
                    const sTime = rec.start_time?.slice(11, 16) || ''
                    const eTime = rec.end_time?.slice(11, 16) || ''
                    return (
                      <tr key={rec.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 8px' }}>{rec.start_time?.slice(0, 10)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ background: '#fef08a', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--black)', fontSize: 12 }}>
                            {rec.user_nickname || rec.user_username || '#' + rec.user_id}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 800 }}>{catNames[rec.category_id] || rec.category_id}</td>
                        <td style={{ padding: '10px 8px', color: '#555' }}>
                          {sTime && eTime ? `${sTime} ~ ${eTime}` : rec.start_time?.slice(11, 19)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{formatDuration(rec.duration)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#00c853', fontWeight: 900 }}>
                          +¥{formatMoney(rec.earned)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 4: 打工人账号档案 (users + user_profiles) */}
        {activeTab === 'users' && (
          <div className="card" style={{ background: '#fff', border: '3px solid var(--black)', boxShadow: '4px 4px 0 var(--black)', padding: 20, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>👥 打工人账号档案 (`users` & `user_profiles`)</h3>
              <button onClick={loadUsers} className="auth-btn login-btn" style={{ fontSize: 12, padding: '4px 10px' }}>
                🔄 刷新
              </button>
            </div>

            {usersList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>暂无用户记录</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontWeight: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--yellow)', borderBottom: '3px solid var(--black)' }}>
                    <th style={{ padding: '10px 8px' }}>ID</th>
                    <th style={{ padding: '10px 8px' }}>昵称</th>
                    <th style={{ padding: '10px 8px' }}>登录账号</th>
                    <th style={{ padding: '10px 8px' }}>角色</th>
                    <th style={{ padding: '10px 8px' }}>月薪档案 (元)</th>
                    <th style={{ padding: '10px 8px' }}>工作时段</th>
                    <th style={{ padding: '10px 8px' }}>累计摸鱼收益</th>
                    <th style={{ padding: '10px 8px' }}>免密设备 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px 8px' }}>#{u.id}</td>
                      <td style={{ padding: '10px 8px' }}>{u.nickname}</td>
                      <td style={{ padding: '10px 8px' }}>{u.username}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            background: u.role === 'admin' ? 'var(--yellow)' : '#eee',
                            padding: '2px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--black)',
                            fontSize: 11,
                          }}
                        >
                          {u.role === 'admin' ? '管理员' : '普通用户'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 900 }}>
                        ¥{formatMoney(u.salary || u.profile?.salary || 10000)}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {u.work_hours || (u.profile ? u.profile.work_start + ' ~ ' + u.profile.work_end : '08:30 ~ 17:30')}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#00c853', fontWeight: 800 }}>
                        ¥{formatMoney(u.total_slack_earned || 0)} ({u.total_slack_count || 0}次)
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 11, color: '#666' }}>{u.device_id || '未绑定'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* 员工每日工资流水下钻模态框 */}
      {drillUser && (
        <div className="moyu-modal-backdrop" onClick={() => setDrillUser(null)}>
          <div
            className="moyu-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 680, width: '100%', textAlign: 'left', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔍 打工人流水下钻：</span>
                  <span style={{ background: 'var(--yellow)', border: '2px solid var(--black)', borderRadius: 6, padding: '2px 8px', fontSize: 14 }}>
                    {drillUser.nickname || drillUser.username}
                  </span>
                </h3>
                <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>
                  查看该员工近 30 天的出勤打卡与摸鱼变现历史明细
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillUser(null)}
                style={{
                  background: '#f0f0f0',
                  border: '2px solid var(--black)',
                  borderRadius: 6,
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '4px 10px',
                }}
              >
                ✕
              </button>
            </div>

            {/* 下钻双模式 Tab 切换 */}
            <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px' }}>
              <button
                type="button"
                onClick={() => setDrillTab('salaries')}
                style={{
                  padding: '6px 14px',
                  border: '2px solid var(--black)',
                  borderRadius: 6,
                  background: drillTab === 'salaries' ? 'var(--yellow)' : '#fff',
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: 'pointer',
                  boxShadow: '1px 1px 0 var(--black)',
                }}
              >
                💵 每日工资快照 ({drillSalaries.length})
              </button>
              <button
                type="button"
                onClick={() => setDrillTab('records')}
                style={{
                  padding: '6px 14px',
                  border: '2px solid var(--black)',
                  borderRadius: 6,
                  background: drillTab === 'records' ? 'var(--yellow)' : '#fff',
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: 'pointer',
                  boxShadow: '1px 1px 0 var(--black)',
                }}
              >
                🐟 摸鱼罪证明细 ({drillRecords.length})
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              {loadingDrill ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>⏳ 正在调取员工流水与明细数据...</div>
              ) : drillTab === 'salaries' ? (
                drillSalaries.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>该打工人近期暂无每日流水快照</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12, fontWeight: 700 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '2px solid var(--black)' }}>
                        <th style={{ padding: '8px 6px' }}>日期</th>
                        <th style={{ padding: '8px 6px' }}>基本出勤</th>
                        <th style={{ padding: '8px 6px' }}>摸鱼收益</th>
                        <th style={{ padding: '8px 6px' }}>实发总额</th>
                        <th style={{ padding: '8px 6px' }}>摸鱼频次</th>
                        <th style={{ padding: '8px 6px' }}>摸鱼时长</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillSalaries.map((s) => (
                        <tr key={s.id || s.date} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '8px 6px', fontWeight: 900 }}>{s.date}</td>
                          <td style={{ padding: '8px 6px', color: '#2b7fff' }}>¥{formatMoney(s.base_salary)}</td>
                          <td style={{ padding: '8px 6px', color: '#00c853', fontWeight: 900 }}>+¥{formatMoney(s.slack_salary)}</td>
                          <td style={{ padding: '8px 6px', fontWeight: 900 }}>¥{formatMoney(s.total_salary)}</td>
                          <td style={{ padding: '8px 6px' }}>{s.slack_count}次</td>
                          <td style={{ padding: '8px 6px' }}>{formatDuration(s.slack_duration)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                drillRecords.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>该打工人暂无摸鱼罪证明细流水</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12, fontWeight: 700 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '2px solid var(--black)' }}>
                        <th style={{ padding: '8px 6px' }}>日期</th>
                        <th style={{ padding: '8px 6px' }}>摸鱼姿势</th>
                        <th style={{ padding: '8px 6px' }}>时段</th>
                        <th style={{ padding: '8px 6px' }}>时长</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>白嫖收益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillRecords.map((r) => {
                        const catNames: Record<string, string> = {
                          toilet: '🚽 带薪拉屎',
                          game: '🎮 摸鱼开黑',
                          phone: '📱 刷短视频',
                          chat: '💬 假装对齐',
                          tea: '☕ 咖啡续命',
                          smoke: '🚬 楼道透气',
                          shop: '🛒 拼多多清购物车',
                          zoneout: '🧘 灵魂出窍',
                        }
                        const sTime = r.start_time?.slice(11, 16) || ''
                        const eTime = r.end_time?.slice(11, 16) || ''
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 6px' }}>{r.start_time?.slice(0, 10)}</td>
                            <td style={{ padding: '8px 6px', fontWeight: 800 }}>{catNames[r.category_id] || r.category_id}</td>
                            <td style={{ padding: '8px 6px', color: '#555' }}>
                              {sTime && eTime ? `${sTime}~${eTime}` : r.start_time?.slice(11, 19)}
                            </td>
                            <td style={{ padding: '8px 6px' }}>{formatDuration(r.duration)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: '#00c853', fontWeight: 900 }}>
                              +¥{formatMoney(r.earned)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              )}
            </div>

            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setDrillUser(null)}
                style={{
                  padding: '8px 18px',
                  background: 'var(--yellow)',
                  border: '2px solid var(--black)',
                  borderRadius: 8,
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 var(--black)',
                }}
              >
                关闭下钻
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
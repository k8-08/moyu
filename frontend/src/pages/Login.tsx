import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import '../App.css'
import { authApi } from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultMode = searchParams.get('mode') === 'register' ? 'register' : 'login'

  const [isRegister, setIsRegister] = useState(defaultMode === 'register')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 表单数据
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // 验证码数据
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [refreshingCaptcha, setRefreshingCaptcha] = useState(false)

  // 刷新验证码
  const fetchCaptcha = async () => {
    try {
      setRefreshingCaptcha(true)
      const res = await authApi.getCaptcha()
      setCaptchaId(res.captcha_id)
      setCaptchaImg(res.image)
    } catch (e: any) {
      console.error('获取验证码失败', e)
    } finally {
      setRefreshingCaptcha(false)
    }
  }

  useEffect(() => {
    fetchCaptcha()
  }, [isRegister])

  // 提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!username.trim()) {
      setErrorMsg('请输入登录账号')
      return
    }
    if (!password) {
      setErrorMsg('请输入密码')
      return
    }

    try {
      setLoading(true)
      if (isRegister) {
        if (!nickname.trim()) {
          setErrorMsg('请输入用户名/昵称')
          setLoading(false)
          return
        }
        if (password !== confirmPassword) {
          setErrorMsg('两次输入的密码不一致')
          setLoading(false)
          return
        }
        if (!captchaCode.trim()) {
          setErrorMsg('请输入图形验证码')
          setLoading(false)
          return
        }

        const res = await authApi.register({
          username: username.trim(),
          nickname: nickname.trim(),
          password,
          confirm_password: confirmPassword,
          captcha_id: captchaId,
          captcha_code: captchaCode.trim(),
        })

        localStorage.setItem('moyu_token', res.access_token)
        localStorage.setItem('moyu_user', JSON.stringify(res.user))
        navigate('/')
      } else {
        const res = await authApi.login({
          username: username.trim(),
          password,
        })

        localStorage.setItem('moyu_token', res.access_token)
        localStorage.setItem('moyu_user', JSON.stringify(res.user))
        if (res.user?.role === 'admin') {
          navigate('/admin')
        } else {
          navigate('/')
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || '操作失败，请重试')
      if (isRegister) {
        fetchCaptcha()
        setCaptchaCode('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="moyu-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 跑马灯 */}
      <div className="ticker">
        <div className="ticker-inner">
          <span>🔐 打工人身份认证中心 • 💰 登录同步你的摸鱼收益与打工档案 • 🛡️ 设备安全绑定 30天免密畅行 • </span>
          <span>🔐 打工人身份认证中心 • 💰 登录同步你的摸鱼收益与打工档案 • 🛡️ 设备安全绑定 30天免密畅行 • </span>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 460, margin: 'auto', padding: '30px 18px' }}>
        <div
          className="card"
          style={{
            background: '#fff',
            textAlign: 'center',
            padding: '28px 24px',
            border: '3px solid var(--black)',
            boxShadow: '5px 5px 0 var(--black)',
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 6 }}>🐂</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 4px' }}>
            {isRegister ? '加入摸鱼公社' : '打工人返岗登录'}
          </h1>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#666', margin: '0 0 20px' }}>
            {isRegister ? '注册专属账号，云端存证白嫖每一分钱' : '输入账号密码，绑定设备免密畅通'}
          </p>

          {/* 选项卡切换 */}
          <div
            style={{
              display: 'flex',
              border: '3px solid var(--black)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsRegister(false)
                setErrorMsg('')
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                fontWeight: 900,
                fontSize: 15,
                background: !isRegister ? 'var(--yellow)' : '#fff',
                border: 'none',
                borderRight: '2px solid var(--black)',
                cursor: 'pointer',
              }}
            >
              🔑 账号登录
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true)
                setErrorMsg('')
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                fontWeight: 900,
                fontSize: 15,
                background: isRegister ? 'var(--yellow)' : '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ✨ 新人注册
            </button>
          </div>

          {/* 错误提示 */}
          {errorMsg && (
            <div
              style={{
                background: '#ffebeb',
                border: '2px solid var(--red)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--red)',
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 16,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
            {/* 注册专属：用户名（昵称） */}
            {isRegister && (
              <label className="field">
                <span>🏷️ 用户名 / 昵称</span>
                <input
                  type="text"
                  placeholder="例如：工位隐形战神"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={20}
                />
              </label>
            )}

            {/* 账号 */}
            <label className="field">
              <span>👤 登录账号（唯一标识/手机号/英文字符）</span>
              <input
                type="text"
                placeholder="例如：13800000000 或 zhangsan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={32}
              />
            </label>

            {/* 密码 */}
            <label className="field">
              <span>🔒 账号密码</span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', paddingRight: 46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 6,
                    background: '#f0f0f0',
                    border: '2px solid var(--black)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '3px 7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    boxShadow: '1px 1px 0 var(--black)'
                  }}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </label>

            {/* 确认密码 */}
            {isRegister && (
              <label className="field">
                <span>🛡️ 确认密码</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: 6,
                      background: '#f0f0f0',
                      border: '2px solid var(--black)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '3px 7px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      userSelect: 'none',
                      boxShadow: '1px 1px 0 var(--black)'
                    }}
                    title={showConfirmPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showConfirmPassword ? '👁️' : '🙈'}
                  </button>
                </div>
              </label>
            )}

            {/* 防机器人验证码 */}
            {isRegister && (
              <div className="field">
                <span>🤖 防机器人图形验证码</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="输入图形码"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    maxLength={6}
                    style={{ flex: 1 }}
                  />
                  <div
                    onClick={fetchCaptcha}
                    title="点击换一张"
                    style={{
                      border: '3px solid var(--black)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      height: 48,
                      minWidth: 120,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fff8e7',
                      boxShadow: '2px 2px 0 var(--black)',
                    }}
                  >
                    {captchaImg ? (
                      <img src={captchaImg} alt="验证码" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#888' }}>
                        {refreshingCaptcha ? '生成中...' : '点击加载'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#777', marginTop: 4, fontWeight: 700 }}>
                  看不清？点击图片即可刷新更换 🔄
                </div>
              </div>
            )}

            {/* 设备记住说明 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#f6fbf7',
                border: '2px dashed #009d57',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: '#0b6b28',
              }}
            >
              <span>🛡️</span>
              <span>已启用当前设备绑定保护，30天免密无感登录，下次打开直接用！</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-btn login-btn"
              style={{
                width: '100%',
                marginTop: 8,
                fontSize: 17,
                padding: '12px 0',
                justifyContent: 'center',
              }}
            >
              {loading ? '正在处理中…' : isRegister ? '🎉 立即注册并登入' : '🚀 立即登入工位'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
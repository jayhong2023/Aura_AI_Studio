import { useState } from 'react'
import { Eye, EyeOff, Gem, Loader2, LockKeyhole, User } from 'lucide-react'

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<unknown>
  subtitle?: string
  description?: string
}

export function LoginPage({
  onLogin,
  subtitle = 'Jewelry AI Studio',
  description = '登录后进入珠宝 AI 视觉创作工作台',
}: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-cream px-4 py-10">
      <div
        aria-hidden
        className="absolute -top-32 -right-20 h-[32rem] w-[32rem] rounded-full bg-champagne/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-champagne-light/25 blur-3xl"
      />

      <section className="lux-card animate-fade-up relative z-10 w-full max-w-md rounded-[2rem] p-6 sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#111] via-[#2b2b2b] to-[#111] shadow-xl ring-1 ring-champagne/40">
            <Gem className="h-7 w-7 text-champagne-light" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-[0.06em] text-ink">
            AuraStudio
          </h1>
          <p className="mt-1 text-sm tracking-wider text-stone uppercase">
            {subtitle}
          </p>
          <p className="mt-4 text-sm text-ink-soft">{description}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!username.trim() || !password) {
              setError('请输入账号和密码')
              return
            }
            setSubmitting(true)
            setError(null)
            void onLogin(username.trim(), password)
              .catch((reason) => {
                setError(
                  reason instanceof Error ? reason.message : '登录失败，请重试',
                )
              })
              .finally(() => setSubmitting(false))
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink-soft">账号</span>
            <span className="flex items-center gap-2 rounded-xl border border-cream-dark bg-white px-3.5 focus-within:border-champagne">
              <User className="h-4 w-4 shrink-0 text-stone" />
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-stone/60"
                placeholder="请输入登录账号"
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink-soft">密码</span>
            <span className="flex items-center gap-2 rounded-xl border border-cream-dark bg-white px-3.5 focus-within:border-champagne">
              <LockKeyhole className="h-4 w-4 shrink-0 text-stone" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-stone/60"
                placeholder="请输入密码"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="rounded-lg p-1.5 text-stone hover:bg-mist hover:text-ink"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </span>
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="lux-gold-btn flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-cream disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? '正在登录…' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-stone">
          账号由系统管理员创建 · 登录凭证仅通过安全 Cookie 保存
        </p>
      </section>
    </main>
  )
}

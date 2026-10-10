import { useState } from 'react'
import { KeyRound, Loader2, X } from 'lucide-react'

interface ChangePasswordModalProps {
  forced?: boolean
  onClose: () => void
  onSubmit: (currentPassword: string, newPassword: string) => Promise<unknown>
}

export function ChangePasswordModal({
  forced = false,
  onClose,
  onSubmit,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      onClick={() => {
        if (!forced) onClose()
      }}
    >
      <section
        className="lux-card w-full max-w-md rounded-3xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-champagne/15 text-champagne-dark">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="change-password-title"
                className="font-display text-xl font-semibold text-ink"
              >
                {forced ? '首次登录，请修改密码' : '修改密码'}
              </h2>
              <p className="mt-1 text-xs text-stone">
                新密码至少 8 个字符，修改后其他设备将退出登录
              </p>
            </div>
          </div>
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-stone hover:bg-mist hover:text-ink"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (newPassword.length < 8) {
              setError('新密码至少需要 8 个字符')
              return
            }
            if (newPassword !== confirmPassword) {
              setError('两次输入的新密码不一致')
              return
            }
            setSubmitting(true)
            setError(null)
            void onSubmit(currentPassword, newPassword)
              .then(() => onClose())
              .catch((reason) =>
                setError(
                  reason instanceof Error ? reason.message : '修改密码失败',
                ),
              )
              .finally(() => setSubmitting(false))
          }}
        >
          <PasswordField
            label="当前密码"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            label="新密码"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <PasswordField
            label="确认新密码"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="lux-gold-btn flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-cream disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? '正在保存…' : '保存新密码'}
          </button>
        </form>
      </section>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-ink-soft">{label}</span>
      <input
        required
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-cream-dark bg-white px-3 text-sm text-ink outline-none focus:border-champagne"
      />
    </label>
  )
}

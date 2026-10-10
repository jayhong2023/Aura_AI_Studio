import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ExternalLink,
  KeyRound,
  LogOut,
  Shield,
  UserRound,
} from 'lucide-react'
import type { AuthUser } from '../lib/authApi'

interface UserMenuProps {
  user: AuthUser
  onChangePassword: () => void
  onLogout: () => void
  compact?: boolean
}

export function UserMenu({
  user,
  onChangePassword,
  onLogout,
  compact = false,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`lux-pill flex items-center rounded-full py-1.5 text-sm text-ink-soft hover:text-ink ${
          compact ? 'gap-1 px-1.5' : 'gap-2 px-2.5'
        }`}
        aria-expanded={open}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-champagne-light to-champagne-dark text-white shadow-inner"
          title={user.displayName || user.username}
        >
          <UserRound className="h-4 w-4" strokeWidth={2} />
        </span>
        <span
          className={`hidden max-w-24 truncate ${compact ? '' : 'sm:inline'}`}
        >
          {user.displayName || user.username}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-[100] mt-2 w-56 overflow-hidden rounded-2xl border border-cream-dark bg-white p-2 shadow-xl">
          <div className="border-b border-cream-dark px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">
              {user.displayName || user.username}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone">
              {user.role === 'admin' ? (
                <Shield className="h-3 w-3" />
              ) : (
                <UserRound className="h-3 w-3" />
              )}
              {user.username} · {user.role === 'admin' ? '管理员' : '普通用户'}
            </p>
          </div>

          {user.role === 'admin' && (
            <a
              href="/admin/"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-soft hover:bg-mist hover:text-ink"
            >
              <Shield className="h-4 w-4" />
              管理后台
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-stone" />
            </a>
          )}
          <MenuButton
            icon={<KeyRound className="h-4 w-4" />}
            label="修改密码"
            onClick={() => {
              setOpen(false)
              onChangePassword()
            }}
          />
          <MenuButton
            danger
            icon={<LogOut className="h-4 w-4" />}
            label="退出登录"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          />
        </div>
      )}
    </div>
  )
}

function MenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-ink-soft hover:bg-mist hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

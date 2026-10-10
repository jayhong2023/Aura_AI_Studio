import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  createUserViaApi,
  deleteUserViaApi,
  listUsersViaApi,
  resetUserPasswordViaApi,
  updateUserViaApi,
  type AuthUser,
  type UserRole,
} from '../lib/authApi'
import { PageHeader, secondaryBtn } from './ui'

interface UserManagementProps {
  currentUser: AuthUser
}

export function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsersViaApi())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载用户失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section>
      <PageHeader
        title="用户管理"
        description={`共 ${users.length} 个账号 · 创建账号、分配角色、禁用用户或重置密码`}
        actions={
          <>
            <button type="button" onClick={() => void load()} className={secondaryBtn}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((value) => !value)}
              className="lux-gold-btn flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-cream"
            >
              <Plus className="h-4 w-4 text-champagne" />
              新建用户
            </button>
          </>
        }
      />
      <div className="lux-card rounded-3xl p-4 sm:p-6">

        {showCreate && (
          <CreateUserForm
            onCancel={() => setShowCreate(false)}
            onCreated={async () => {
              setShowCreate(false)
              await load()
            }}
          />
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-stone">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在加载用户…
          </div>
        ) : (
          <div className="grid gap-3">
            {users.map((user) => {
              const isSelf = user.id === currentUser.id
              const busy = busyId === user.id
              return (
                <article
                  key={user.id}
                  className={`rounded-2xl border p-4 ${
                    user.disabled
                      ? 'border-stone/20 bg-mist/60 opacity-75'
                      : 'border-cream-dark bg-white/75'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          user.role === 'admin'
                            ? 'bg-champagne/15 text-champagne-dark'
                            : 'bg-mist text-stone'
                        }`}
                      >
                        {user.role === 'admin' ? (
                          <Shield className="h-5 w-5" />
                        ) : (
                          <UserRound className="h-5 w-5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {user.displayName || user.username}
                          {isSelf && (
                            <span className="ml-2 rounded-full bg-champagne/15 px-2 py-0.5 text-[10px] text-champagne-dark">
                              当前账号
                            </span>
                          )}
                          {user.disabled && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                              已禁用
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-stone">
                          @{user.username} · 创建于{' '}
                          {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                          {user.lastLoginAt
                            ? ` · 最近登录 ${new Date(user.lastLoginAt).toLocaleString('zh-CN')}`
                            : ' · 尚未登录'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={user.role}
                        disabled={busy || isSelf}
                        onChange={(event) => {
                          const role = event.target.value as UserRole
                          void run(user.id, () =>
                            updateUserViaApi(user.id, { role }),
                          )
                        }}
                        className="min-h-9 rounded-lg border border-cream-dark bg-white px-2 text-xs text-ink disabled:opacity-50"
                        aria-label={`${user.username} 的角色`}
                      >
                        <option value="user">普通用户</option>
                        <option value="admin">管理员</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() =>
                          void run(user.id, () =>
                            updateUserViaApi(user.id, {
                              disabled: !user.disabled,
                            }),
                          )
                        }
                        className="min-h-9 rounded-lg border border-cream-dark bg-white px-3 text-xs text-ink-soft hover:border-champagne/50 disabled:opacity-50"
                      >
                        {user.disabled ? '启用' : '禁用'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const password = window.prompt(
                            `为 ${user.username} 设置临时密码（至少 8 位）：`,
                          )
                          if (!password) return
                          void run(user.id, () =>
                            resetUserPasswordViaApi(user.id, password),
                          )
                        }}
                        className="flex min-h-9 items-center gap-1 rounded-lg border border-cream-dark bg-white px-3 text-xs text-ink-soft hover:border-champagne/50 disabled:opacity-50"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        重置密码
                      </button>
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `确定删除用户 ${user.username}？此操作不可撤销。`,
                            )
                          ) {
                            return
                          }
                          void run(user.id, () => deleteUserViaApi(user.id))
                        }}
                        className="flex min-h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-stone" />}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function CreateUserForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mb-5 rounded-2xl border border-champagne/35 bg-champagne/5 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitting(true)
        setError(null)
        void createUserViaApi({ username, displayName, password, role })
          .then(() => onCreated())
          .catch((reason) =>
            setError(reason instanceof Error ? reason.message : '创建失败'),
          )
          .finally(() => setSubmitting(false))
      }}
    >
      <h3 className="font-medium text-ink">创建新用户</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="登录账号">
          <input
            required
            minLength={3}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="例如 zhangsan"
            className="form-input"
          />
        </Field>
        <Field label="显示名称">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="例如 张三"
            className="form-input"
          />
        </Field>
        <Field label="临时密码">
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位"
            className="form-input"
          />
        </Field>
        <Field label="角色">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="form-input"
          >
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-cream-dark bg-white px-4 py-2 text-sm text-ink-soft"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="lux-gold-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          创建账号
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-stone">{label}</span>
      {children}
    </label>
  )
}

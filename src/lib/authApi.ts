import { apiFetch } from './http'

export type UserRole = 'admin' | 'user'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  disabled: boolean
  mustChangePassword: boolean
  createdAt: number
  updatedAt: number
  lastLoginAt?: number
}

interface ApiErrorBody {
  ok: false
  error: string
  code?: string
}

export class AuthApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, init)
  const raw = await res.text()
  let data: T | ApiErrorBody
  try {
    data = raw ? (JSON.parse(raw) as T | ApiErrorBody) : ({} as T)
  } catch {
    throw new AuthApiError(`服务返回格式异常（HTTP ${res.status}）`, res.status)
  }
  if (!res.ok) {
    const error = data as ApiErrorBody
    throw new AuthApiError(
      error.error || `请求失败（HTTP ${res.status}）`,
      res.status,
      error.code,
    )
  }
  return data as T
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await request<{ ok: true; user: AuthUser }>('/api/auth/me')
    return data.user
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) return null
    throw error
  }
}

export async function loginViaApi(
  username: string,
  password: string,
): Promise<AuthUser> {
  const data = await request<{ ok: true; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return data.user
}

export async function logoutViaApi(): Promise<void> {
  await request<{ ok: true }>('/api/auth/logout', { method: 'POST' })
}

export async function changePasswordViaApi(
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const data = await request<{ ok: true; user: AuthUser }>(
    '/api/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  )
  return data.user
}

export async function listUsersViaApi(): Promise<AuthUser[]> {
  const data = await request<{ ok: true; users: AuthUser[] }>(
    '/api/admin/users',
  )
  return data.users
}

export async function createUserViaApi(input: {
  username: string
  displayName: string
  password: string
  role: UserRole
}): Promise<AuthUser> {
  const data = await request<{ ok: true; user: AuthUser }>(
    '/api/admin/users',
    { method: 'POST', body: JSON.stringify(input) },
  )
  return data.user
}

export async function updateUserViaApi(
  id: string,
  input: {
    displayName?: string
    role?: UserRole
    disabled?: boolean
  },
): Promise<AuthUser> {
  const data = await request<{ ok: true; user: AuthUser }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return data.user
}

export async function resetUserPasswordViaApi(
  id: string,
  newPassword: string,
): Promise<void> {
  await request<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
    { method: 'POST', body: JSON.stringify({ newPassword }) },
  )
}

export async function deleteUserViaApi(id: string): Promise<void> {
  await request<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

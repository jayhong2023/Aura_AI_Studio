import { useCallback, useEffect, useState } from 'react'
import {
  changePasswordViaApi,
  fetchCurrentUser,
  loginViaApi,
  logoutViaApi,
  type AuthUser,
} from './authApi'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const current = await fetchCurrentUser()
    setUser(current)
    return current
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const handleExpired = () => setUser(null)
    window.addEventListener('aurastudio:auth-expired', handleExpired)
    return () => {
      cancelled = true
      window.removeEventListener('aurastudio:auth-expired', handleExpired)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const current = await loginViaApi(username, password)
    setUser(current)
    return current
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutViaApi()
    } finally {
      setUser(null)
    }
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const current = await changePasswordViaApi(
        currentPassword,
        newPassword,
      )
      setUser(current)
      return current
    },
    [],
  )

  return { user, loading, login, logout, changePassword, refresh }
}

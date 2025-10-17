const STORAGE_KEY = 'treasure-hunt:last-scanned-token'

export const storeScannedToken = (token: string) => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    try {
      window.localStorage.setItem(STORAGE_KEY, token)
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }
}

export const pullStoredScannedToken = (): string | null => {
  if (typeof window === 'undefined') return null
  let token: string | null = null
  try {
    token = window.sessionStorage.getItem(STORAGE_KEY)
    if (token) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return token
    }
  } catch {
    // fall back to localStorage
  }
  try {
    token = window.localStorage.getItem(STORAGE_KEY)
    if (token) {
      window.localStorage.removeItem(STORAGE_KEY)
      return token
    }
  } catch {
    // ignore
  }
  return null
}

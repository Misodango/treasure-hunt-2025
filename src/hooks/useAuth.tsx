import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  type ActionCodeSettings,
  type User,
  type UserCredential
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ADMIN_UID, auth } from '../firebase/config'

type AuthRole = 'leader' | 'admin' | null

type AuthContextValue = {
  user: User | null
  role: AuthRole
  loading: boolean
  sendLoginLink: (email: string) => Promise<void>
  completeEmailLinkSignin: (email?: string) => Promise<UserCredential | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const pendingEmailStorageKey = 'treasure-hunt-pending-email'

const actionCodeSettings: ActionCodeSettings = {
  url: import.meta.env.VITE_EMAIL_LINK_REDIRECT_URL ?? window.location.href,
  handleCodeInApp: true
}

const fetchRole = async (user: User | null): Promise<AuthRole> => {
  if (!user) return null
  if (ADMIN_UID && user.uid === ADMIN_UID) return 'admin'

  const tokenResult = await user.getIdTokenResult(true).catch(() => null)
  const claimRole = tokenResult?.claims?.role
  if (claimRole === 'leader') return 'leader'
  if (claimRole === 'admin') return 'admin'
  return null
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AuthRole>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const resolvedRole = await fetchRole(firebaseUser)
        setRole(resolvedRole)
      } else {
        setRole(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const sendLoginLink = useCallback(async (email: string) => {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings)
    window.localStorage.setItem(pendingEmailStorageKey, email)
  }, [])

  const completeEmailLinkSignin = useCallback(
    async (email?: string) => {
      if (!isSignInWithEmailLink(auth, window.location.href)) return null

      let finalEmail = email
      if (!finalEmail) {
        finalEmail = window.localStorage.getItem(pendingEmailStorageKey) ?? undefined
      }

      if (!finalEmail) {
        throw new Error('メールアドレスが見つかりません。入力して再度お試しください。')
      }

      const credential = await signInWithEmailLink(auth, finalEmail, window.location.href)
      window.localStorage.removeItem(pendingEmailStorageKey)
      return credential
    },
    []
  )

  const signOutUser = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      sendLoginLink,
      completeEmailLinkSignin,
      signOut: signOutUser
    }),
    [user, role, loading, sendLoginLink, completeEmailLinkSignin, signOutUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

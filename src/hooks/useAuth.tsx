import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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
  signInWithGoogle: () => Promise<UserCredential>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

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

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    const hdDomain = import.meta.env.VITE_GOOGLE_HD_DOMAIN as string | undefined
    if (hdDomain) {
      provider.setCustomParameters({ hd: hdDomain })
    }
    return signInWithPopup(auth, provider)
  }, [])

  const signOutUser = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      signInWithGoogle,
      signOut: signOutUser
    }),
    [user, role, loading, signInWithGoogle, signOutUser]
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

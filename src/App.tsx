import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useRuntimeSettings } from './hooks/useRuntimeSettings'
import { usePublicLeaderboard } from './hooks/usePublicLeaderboard'
import { computePhaseState } from './lib/time'
import PublicScoreboard from './components/PublicScoreboard'
import TeamDashboard from './components/TeamDashboard'
import AdminDashboard from './components/AdminDashboard'
import LoginScreen from './components/LoginScreen'
import LoadingSpinner from './components/LoadingSpinner'
import QrScannerPage from './components/QrScannerPage'

const MainApp = () => {
  const { user, role, loading: authLoading, signOut } = useAuth()
  const runtime = useRuntimeSettings()
  const leaderboard = usePublicLeaderboard()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const phase = useMemo(() => computePhaseState(runtime.data, now), [runtime.data, now])

  const renderDashboard = () => {
    if (authLoading) {
      return <LoadingSpinner label="認証状態を確認中..." />
    }
    if (!user || !role) {
      return <LoginScreen />
    }
    if (role === 'admin') {
      return <AdminDashboard />
    }
    if (role === 'leader') {
      return <TeamDashboard />
    }
    return (
      <section className="card">
        <p>権限が付与されていません。管理者にお問い合わせください。</p>
        <button className="secondary" onClick={() => signOut()}>
          ログアウト
        </button>
      </section>
    )
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div>
          <h1>明和寮 宝探しイベント</h1>
          <p>ダッシュボード</p>
        </div>
        <div className="header-meta">
          {user ? (
            <>
              <span className="user-chip">
                {role ?? '未設定'}: {user.email}
              </span>
              <button className="secondary small" onClick={() => signOut()}>
                ログアウト
              </button>
            </>
          ) : (
            <span className="user-chip">未ログイン</span>
          )}
        </div>
      </header>
      <main className="app-main">
        <PublicScoreboard
          phase={phase}
          leaderboard={leaderboard.data}
          loading={leaderboard.loading}
          error={leaderboard.error}
          runtimeError={runtime.error}
        />
        {renderDashboard()}
      </main>
      <footer className="app-footer">
        <small>© {new Date().getFullYear()} 明和寮 イベント委員</small>
      </footer>
    </div>
  )
}

const App = () => {
  const isScannerRoute =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/qr-scan')

  if (isScannerRoute) {
    return <QrScannerPage />
  }

  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  )
}

export default App

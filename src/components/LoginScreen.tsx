import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

const LoginScreen = () => {
  const { user, role, loading, signInWithGoogle } = useAuth()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleGoogleSignin = async () => {
    setPending(true)
    setError(null)
    setStatus(null)
    try {
      const credential = await signInWithGoogle()
      setStatus(`ログインしました: ${credential.user.email ?? ''}`)
    } catch (err) {
      console.error(err)
      setError('Googleログインに失敗しました。アカウント権限を確認してください。')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card">
      <h2>ログイン</h2>
      <p className="description">
        Googleアカウントでログインします。寮イベント用に許可されたアカウントのみアクセスできます。
      </p>
      {pending ? <LoadingSpinner label="Googleに接続しています..." /> : null}
      {status ? <p className="status success">{status}</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {loading ? (
        <LoadingSpinner label="認証状態を確認中..." />
      ) : user ? (
        <p className="status info">
          ログイン中: <strong>{user.email}</strong> / ロール: {role ?? '未付与'}
        </p>
      ) : 
        <button type="button" onClick={handleGoogleSignin} disabled={pending}>
          Googleでログイン
        </button>
      }
    </section>
  )
}

export default LoginScreen

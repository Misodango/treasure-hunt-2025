import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

const LoginScreen = () => {
  const { user, role, loading, sendLoginLink, completeEmailLinkSignin } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleSendLink = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    setPending(true)
    setError(null)
    try {
      await sendLoginLink(email)
      setStatus('ログインリンクを送信しました。メールを確認してください。')
    } catch (err) {
      console.error(err)
      setError('リンク送信に失敗しました。メールアドレスを確認して再試行してください。')
    } finally {
      setPending(false)
    }
  }

  const handleCompleteSignin = async () => {
    setPending(true)
    setError(null)
    try {
      await completeEmailLinkSignin(email)
      setStatus('ログインが完了しました。')
    } catch (err) {
      console.error(err)
      setError('ログインに失敗しました。メールアドレスを入力して、再度リンクを開いてください。')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card">
      <h2>ログイン</h2>
      <p className="description">
        登録済みリーダーのメールアドレス宛にログインリンクを送信します。
        メール内のボタンをタップするとこの画面に戻り、ログインが完了します。
      </p>
      <form onSubmit={handleSendLink} className="form-vertical">
        <label className="form-field">
          <span>メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="leader@example.com"
            disabled={pending}
          />
        </label>
        <button type="submit" disabled={pending}>
          リンクを送信
        </button>
      </form>
      <button type="button" className="secondary" onClick={handleCompleteSignin} disabled={pending}>
        すでにメールを開いている場合はここをタップ
      </button>
      {pending ? <LoadingSpinner label="処理中..." /> : null}
      {status ? <p className="status success">{status}</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {loading ? (
        <LoadingSpinner label="認証状態を確認中..." />
      ) : user ? (
        <p className="status info">
          ログイン中: <strong>{user.email}</strong> / ロール: {role ?? '未付与'}
        </p>
      ) : null}
    </section>
  )
}

export default LoginScreen

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import LoadingSpinner from './LoadingSpinner'
import { useAuth } from '../hooks/useAuth'
import { useTeamData } from '../hooks/useTeamData'
import { submitClaim } from '../lib/claim'
import { useLocations } from '../hooks/useLocations'
import { pullStoredScannedToken } from '../lib/qr'

type ClaimResultState = {
  message: string
  points?: number
}

const resolveSolveDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate()
  }
  return null
}

const TeamDashboard = () => {
  const { user, signOut } = useAuth()
  const { data: team, loading } = useTeamData(user?.uid)
  const { data: locations } = useLocations()
  const [token, setToken] = useState('')
  const [keyword, setKeyword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ClaimResultState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefilledNotice, setPrefilledNotice] = useState<string | null>(null)

  const openScannerPage = () => {
    if (typeof window === 'undefined') return
    window.location.href = '/qr-scan'
  }

  useEffect(() => {
    const stored = pullStoredScannedToken()
    if (stored) {
      setToken(stored)
      setPrefilledNotice('QRスキャナーからトークンを読み取り済みです。内容を確認して提出してください。')
    }
  }, [])

  const solvedList = useMemo(() => {
    if (!team?.solved) return []
    return Object.entries(team.solved)
      .map(([locId, value]) => ({
        locId,
        points: value.points,
        at: resolveSolveDate(value.at)
      }))
      .sort((a, b) => {
        if (!a.at || !b.at) return 0
        return b.at.getTime() - a.at.getTime()
      })
  }, [team?.solved])

  const handleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    if (!team) return
    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const response = await submitClaim({
        token,
        providedKeyword: keyword.trim(),
        providedTeamTag: team.teamTag
      })
      setResult({
        message: `提出完了！ ${response.locationId} で ${response.pointsAwarded} 点を獲得しました。`,
        points: response.pointsAwarded
      })
      setToken('')
      setKeyword('')
    } catch (err) {
      console.error(err)
      setError('提出に失敗しました。QRコードと合言葉を確認して再試行してください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section className="card">
        <LoadingSpinner label="チーム情報を読み込み中..." />
      </section>
    )
  }

  if (!team) {
    return (
      <section className="card">
        <h2>チーム情報が見つかりません</h2>
        <p>登録が完了しているか確認してください。サポートが必要な場合は管理者に連絡してください。</p>
        <button className="secondary" onClick={() => signOut()}>
          ログアウト
        </button>
      </section>
    )
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>{team.name}</h2>
          <p className="description">
            TeamTag: <strong>{team.teamTag}</strong>
          </p>
        </div>
        <div className="score-box">
          <span className="score-label">現在スコア</span>
          <span className="score-value">{team.score} pt</span>
        </div>
      </header>

      <form className="form-vertical" onSubmit={handleSubmit}>
        {prefilledNotice ? <p className="status info">{prefilledNotice}</p> : null}
        <button type="button" className="secondary" onClick={openScannerPage}>
          QRスキャナーを開く
        </button>
        <label className="form-field">
          <span>QRトークン</span>
          <input
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="locId|nonce|exp|signature"
            required
            disabled={submitting}
          />
        </label>

        <label className="form-field">
          <span>箱キーワード</span>
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="例: AKAGANE"
            required
            disabled={submitting}
          />
          <small className="form-hint">提出時に TeamTag ({team.teamTag}) が自動で添付されます。</small>
        </label>

        <button type="submit" disabled={submitting}>
          提出する
        </button>
      </form>

      {submitting ? <LoadingSpinner label="提出中..." /> : null}
      {result ? <p className="status success">{result.message}</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      <section className="subsection">
        <h3>提出履歴</h3>
        {solvedList.length === 0 ? (
          <p className="description">まだ提出はありません。</p>
        ) : (
          <ul className="history-list">
            {solvedList.map((entry) => {
              const location = locations.find((loc) => loc.id === entry.locId)
              return (
                <li key={entry.locId}>
                  <div>
                    <strong>{location?.title ?? entry.locId}</strong>
                    <span className="history-meta">
                      {entry.at ? entry.at.toLocaleTimeString() : '時刻不明'}
                    </span>
                  </div>
                  <span className="history-points">+{entry.points} pt</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="card-footer">
        <button className="secondary" onClick={() => signOut()}>
          ログアウト
        </button>
      </footer>
    </section>
  )
}

export default TeamDashboard

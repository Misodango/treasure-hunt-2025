import LoadingSpinner from './LoadingSpinner'
import type { PhaseState } from '../lib/time'
import type { PublicLeaderboardDoc } from '../hooks/usePublicLeaderboard'
import { formatDuration } from '../lib/time'

const toDate = (value: unknown) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate()
  return null
}

type PublicScoreboardProps = {
  phase: PhaseState
  leaderboard: PublicLeaderboardDoc | null
  loading: boolean
  error: Error | null
  runtimeError?: Error | null
}

const PhaseMessage = ({ phase }: { phase: PhaseState }) => {
  switch (phase.phase) {
    case 'pre':
      return (
        <p className="status info">
          開始まで {phase.countdownTarget ? formatDuration(phase.countdownTarget) : '--:--'}
        </p>
      )
    case 'running':
      return (
        <p className="status success">
          開催中！凍結まで {phase.countdownTarget ? formatDuration(phase.countdownTarget) : '--:--'}
        </p>
      )
    case 'frozen':
      return <p className="status warning">🔒 ラストスパート中！順位は終了後に公開されます。</p>
    case 'finished':
      return <p className="status success">イベント終了。最終結果を公開中。</p>
    default:
      return <p className="status info">イベント設定を待っています。</p>
  }
}

const PublicScoreboard = ({
  phase,
  leaderboard,
  loading,
  error,
  runtimeError
}: PublicScoreboardProps) => {
  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>公開ランキング</h2>
          <p className="description">リアルタイム更新のスコアボードです。</p>
        </div>
      </header>
      <PhaseMessage phase={phase} />
      {runtimeError ? (
        <p className="status error">イベント設定の読み込みに失敗しました。</p>
      ) : null}
      {loading ? (
        <LoadingSpinner label="ランキングを取得中..." />
      ) : error ? (
        <p className="status error">ランキングの取得に失敗しました。</p>
      ) : !leaderboard || leaderboard.entries.length === 0 ? (
        <p className="description">まだスコアはありません。</p>
      ) : !phase.isLeaderboardVisible || leaderboard.masked ? (
        <p className="status warning">🔒 ラストスパート中！順位は終了後に公開されます。</p>
      ) : (
        <table className="scoreboard">
          <thead>
            <tr>
              <th>#</th>
              <th>チーム</th>
              <th>スコア</th>
              <th>最終提出</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.entries.map((entry, index) => (
              <tr key={entry.teamName + index}>
                <td>{index + 1}</td>
                <td>{entry.teamName}</td>
                <td>{entry.score}</td>
                <td>{toDate(entry.lastSolveAt)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default PublicScoreboard

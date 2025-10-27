import { useEffect, useMemo, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'
import type { PhaseState } from '../lib/time'
import type { LeaderboardGroup, LeaderboardMatch, PublicLeaderboardDoc } from '../hooks/usePublicLeaderboard'
import { formatDuration } from '../lib/time'

const toDate = (value: unknown) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate()
  return null
}

const formatElapsed = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--:--'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (v: number) => v.toString().padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
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
  const matches = leaderboard?.matches ?? []
  const legacyEntries =
    matches.length === 0
      ? ((leaderboard as unknown as { entries?: Array<{ teamName: string; score: number; lastSolveAt?: unknown }> })?.entries ??
        null)
      : null
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (matches.length === 0) {
      if (selectedMatchId !== null) setSelectedMatchId(null)
      return
    }
    if (!selectedMatchId || !matches.some((match) => match.id === selectedMatchId)) {
      const nextMatch =
        matches.find((match) => match.groups.length > 0 && match.isActive !== false) ?? matches[0]
      if ((nextMatch?.id ?? null) !== selectedMatchId) {
        setSelectedMatchId(nextMatch?.id ?? null)
      }
    }
  }, [matches, selectedMatchId])

  useEffect(() => {
    if (!selectedMatchId) {
      if (selectedGroupId !== null) setSelectedGroupId(null)
      return
    }
    const currentMatch = matches.find((match) => match.id === selectedMatchId)
    if (!currentMatch) {
      if (selectedGroupId !== null) setSelectedGroupId(null)
      return
    }
    if (!selectedGroupId || !currentMatch.groups.some((group) => group.id === selectedGroupId)) {
      const nextGroupId = currentMatch.groups[0]?.id ?? null
      if (nextGroupId !== selectedGroupId) {
        setSelectedGroupId(nextGroupId)
      }
    }
  }, [matches, selectedMatchId, selectedGroupId])

  const selectedMatch: LeaderboardMatch | null = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  )
  const selectedGroup: LeaderboardGroup | null = useMemo(
    () => selectedMatch?.groups.find((group) => group.id === selectedGroupId) ?? null,
    [selectedMatch, selectedGroupId]
  )
  const scoreboardMasked = !phase.isLeaderboardVisible || leaderboard?.masked
  const groupEntries = selectedGroup?.entries ?? []

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
      ) : (
        <>
          {leaderboard?.unassignedNotice ? (
            <p className="status warning">
              割り当てられていないチームが存在します。管理画面で試合・組の設定を確認してください。
            </p>
          ) : null}

          {legacyEntries ? (
            scoreboardMasked ? (
              <p className="status warning">🔒 ラストスパート中！順位は終了後に公開されます。</p>
            ) : legacyEntries.length === 0 ? (
              <p className="description">まだスコアはありません。</p>
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
                  {legacyEntries.map((entry, index) => (
                    <tr key={entry.teamName + index}>
                      <td>{index + 1}</td>
                      <td>{entry.teamName}</td>
                      <td>{entry.score}</td>
                      <td>
                        {toDate(entry.lastSolveAt)?.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        }) ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : matches.length === 0 ? (
            <p className="description">まだ試合が登録されていません。</p>
          ) : (
            <>
              <div className="grid grid-2">
                <label className="form-field">
                  <span>試合</span>
                  <select
                    value={selectedMatchId ?? ''}
                    onChange={(event) => setSelectedMatchId(event.target.value || null)}
                  >
                    <option value="">選択してください</option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>
                        {match.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>組</span>
                  <select
                    value={selectedGroupId ?? ''}
                    onChange={(event) => setSelectedGroupId(event.target.value || null)}
                    disabled={!selectedMatch || selectedMatch.groups.length === 0}
                  >
                    <option value="">選択してください</option>
                    {selectedMatch?.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    )) ?? null}
                  </select>
                </label>
              </div>

              {selectedGroup?.startAt ? (
                <p className="description">
                  開始時刻: {toDate(selectedGroup.startAt)?.toLocaleString() ?? '未設定'}
                </p>
              ) : null}

              {scoreboardMasked ? (
                <p className="status warning">🔒 ラストスパート中！順位は終了後に公開されます。</p>
              ) : !selectedMatch ? (
                <p className="description">表示する試合を選択してください。</p>
              ) : selectedMatch.groups.length === 0 ? (
                <p className="description">この試合にはまだ組が登録されていません。</p>
              ) : !selectedGroup ? (
                <p className="description">表示する組を選択してください。</p>
              ) : groupEntries.length === 0 ? (
                <p className="description">まだスコアはありません。</p>
              ) : (
                <table className="scoreboard">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>チーム</th>
                      <th>スコア</th>
                      <th>経過時間</th>
                      <th>最終提出</th>
                      <th>解答数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupEntries.map((entry, index) => (
                      <tr key={`${entry.teamId}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{entry.teamName}</td>
                        <td>{entry.score}</td>
                        <td>{formatElapsed(entry.elapsedSeconds)}</td>
                        <td>
                          {toDate(entry.lastSolveAt)?.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          }) ?? '-'}
                        </td>
                        <td>{entry.solvedCount ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

export default PublicScoreboard

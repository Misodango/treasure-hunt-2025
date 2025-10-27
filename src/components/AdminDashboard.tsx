import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import LoadingSpinner from './LoadingSpinner'
import { useLocations } from '../hooks/useLocations'
import { useRuntimeSettings } from '../hooks/useRuntimeSettings'
import { useMatchHierarchy } from '../hooks/useMatches'
import {
  createGroup,
  createLocation,
  createMatch,
  deleteGroupById,
  deleteLocationById,
  deleteMatchById,
  generateSignedQr,
  setFreezeState,
  setUserRole,
  updateGroupById,
  updateLocationById,
  updateMatchById,
  updateRuntimeSetting
} from '../lib/admin'
import type { LocationUpdateInput } from '../lib/admin'
import type { RuntimeSettings } from '../lib/time'

type QrPreview = {
  locationId: string
  pngBase64: string
  token: string
  nonce: string
}

type RoleForm = {
  email: string
  uid: string
  role: 'leader' | 'admin' | 'none'
  teamName: string
  teamTag: string
  matchId: string
  groupId: string
}

const toDate = (value: RuntimeSettings[keyof RuntimeSettings] | unknown) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
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

const toDatetimeLocal = (value: RuntimeSettings[keyof RuntimeSettings] | unknown) => {
  const date = toDate(value)
  if (!date) return ''
  const tzOffset = date.getTimezoneOffset() * 60000
  const local = new Date(date.getTime() - tzOffset)
  return local.toISOString().slice(0, 16)
}

const parseDatetimeLocal = (value: string) => (value ? new Date(value) : null)

const AdminDashboard = () => {
  const {
    data: matchHierarchy,
    loading: matchesLoading,
    error: matchesError
  } = useMatchHierarchy()
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const { data: locations, loading: locationsLoading, error: locationsError } = useLocations(
    selectedMatchId && selectedMatchId !== '__ALL__' ? selectedMatchId : null
  )
  const {
    data: runtimeDoc,
    loading: runtimeLoading,
    error: runtimeError
  } = useRuntimeSettings()

  const [newMatch, setNewMatch] = useState({
    name: '',
    order: 1,
    isActive: true
  })
  const [newGroup, setNewGroup] = useState({
    matchId: '',
    name: '',
    order: 1,
    startAt: '',
    endAt: '',
    isActive: true
  })
  const [newLocation, setNewLocation] = useState({
    matchId: '',
    title: '',
    difficulty: 1,
    basePoints: 100,
    boxKeyword: '',
    isActive: true
  })

  useEffect(() => {
    if (selectedMatchId === '__ALL__') return
    if (matchHierarchy.length === 0) {
      setSelectedMatchId(null)
      return
    }
    if (!selectedMatchId || !matchHierarchy.some((match) => match.id === selectedMatchId)) {
      const next = matchHierarchy.find((match) => match.isActive) ?? matchHierarchy[0]
      setSelectedMatchId(next.id)
    }
  }, [matchHierarchy, selectedMatchId])

  const selectedMatch = useMemo(
    () => matchHierarchy.find((match) => match.id === selectedMatchId) ?? null,
    [matchHierarchy, selectedMatchId]
  )

  const isAllMatchesSelected = selectedMatchId === '__ALL__'

  useEffect(() => {
    if (!selectedMatch) {
      setSelectedGroupId(null)
      return
    }
    if (!selectedGroupId || !selectedMatch.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(selectedMatch.groups[0]?.id ?? null)
    }
  }, [selectedMatch, selectedGroupId])

  const selectedGroup = useMemo(
    () => selectedMatch?.groups.find((group) => group.id === selectedGroupId) ?? null,
    [selectedMatch, selectedGroupId]
  )

  useEffect(() => {
    setNewLocation((prev) => ({
      ...prev,
      matchId: selectedMatchId && selectedMatchId !== '__ALL__' ? selectedMatchId : ''
    }))
  }, [selectedMatchId])

  useEffect(() => {
    setNewGroup((prev) => {
      const base = {
        ...prev,
        matchId: selectedMatchId && selectedMatchId !== '__ALL__' ? selectedMatchId : ''
      }
      if (prev.name || !selectedMatch || selectedMatchId === '__ALL__') {
        return base
      }
      return {
        ...base,
        order: selectedMatch.groups.length + 1
      }
    })
  }, [selectedMatch, selectedMatchId])

  useEffect(() => {
    setNewMatch((prev) => {
      if (prev.name || matchHierarchy.length === 0) return prev
      return {
        ...prev,
        order: matchHierarchy.length + 1
      }
    })
  }, [matchHierarchy])

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  )

  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrPreview, setQrPreview] = useState<QrPreview | null>(null)
  const createInitialRoleForm = (): RoleForm => ({
    email: '',
    uid: '',
    role: 'leader',
    teamName: '',
    teamTag: '',
    matchId: '',
    groupId: ''
  })
  const [roleForm, setRoleForm] = useState<RoleForm>(() => createInitialRoleForm())

  useEffect(() => {
    if (matchHierarchy.length === 0) return
    setRoleForm((prev) => {
      if (prev.matchId) return prev
      const match = matchHierarchy[0]
      const group = match.groups[0]
      return {
        ...prev,
        matchId: match?.id ?? '',
        groupId: group?.id ?? ''
      }
    })
  }, [matchHierarchy])

  useEffect(() => {
    if (!roleForm.matchId) return
    const match = matchHierarchy.find((item) => item.id === roleForm.matchId)
    if (!match) return
    if (!match.groups.some((group) => group.id === roleForm.groupId)) {
      const fallbackGroup = match.groups[0]?.id ?? ''
      setRoleForm((prev) => ({
        ...prev,
        groupId: fallbackGroup
      }))
    }
  }, [roleForm.matchId, roleForm.groupId, matchHierarchy])

  const groupsForRoleForm = useMemo(
    () => matchHierarchy.find((match) => match.id === roleForm.matchId)?.groups ?? [],
    [matchHierarchy, roleForm.matchId]
  )

  const matchNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const match of matchHierarchy) {
      map.set(match.id, match.name)
    }
    return map
  }, [matchHierarchy])

  const handleCreateLocation = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    if (!newLocation.matchId) {
      setError('ロケーションを紐づける試合を選択してください。')
      return
    }
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await createLocation(newLocation)
      setStatus('ロケーションを追加しました。')
      setNewLocation({
        matchId: selectedMatchId ?? newLocation.matchId,
        title: '',
        difficulty: 1,
        basePoints: 100,
        boxKeyword: '',
        isActive: true
      })
    } catch (err) {
      console.error(err)
      setError('ロケーションの作成に失敗しました。入力内容を確認してください。')
    } finally {
      setPending(false)
    }
  }

  const handleUpdateLocation = async (updates: LocationUpdateInput) => {
    if (!selectedLocation) return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await updateLocationById(selectedLocation.id, updates)
      setStatus('ロケーションを更新しました。')
    } catch (err) {
      console.error(err)
      setError('ロケーションの更新に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleDeleteLocation = async () => {
    if (!selectedLocation) return
    const confirmation = window.confirm(
      `${selectedLocation.title} を削除します。提出履歴は残りますが、元に戻せません。続行しますか？`
    )
    if (!confirmation) return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await deleteLocationById(selectedLocation.id)
      setSelectedLocationId(null)
      setStatus('ロケーションを削除しました。')
    } catch (err) {
      console.error(err)
      setError('削除に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleCreateMatch = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    if (!newMatch.name.trim()) {
      setError('試合名を入力してください。')
      return
    }
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await createMatch({
        name: newMatch.name.trim(),
        order: Number.isFinite(Number(newMatch.order)) ? Number(newMatch.order) : matchHierarchy.length + 1,
        isActive: newMatch.isActive
      })
      setStatus('試合を追加しました。')
      setNewMatch({
        name: '',
        order: matchHierarchy.length + 2,
        isActive: true
      })
    } catch (err) {
      console.error(err)
      setError('試合の作成に失敗しました。入力内容を確認してください。')
    } finally {
      setPending(false)
    }
  }

  const handleUpdateMatch = async (updates: Partial<{ name: string; order: number; isActive: boolean }>) => {
    if (!selectedMatch || selectedMatchId === '__ALL__') return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await updateMatchById(selectedMatch.id, updates)
      setStatus('試合を更新しました。')
    } catch (err) {
      console.error(err)
      setError('試合の更新に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleDeleteMatch = async () => {
    if (!selectedMatch || selectedMatchId === '__ALL__') return
    if (selectedMatch.groups.length > 0) {
      setError('この試合には組が割り当てられています。先に組を削除してください。')
      return
    }
    const confirmation = window.confirm(
      `${selectedMatch.name} を削除します。関連するロケーションは手動で移動する必要があります。続行しますか？`
    )
    if (!confirmation) return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await deleteMatchById(selectedMatch.id)
      setStatus('試合を削除しました。')
      setSelectedMatchId('__ALL__')
    } catch (err) {
      console.error(err)
      setError('試合の削除に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleCreateGroup = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    const targetMatchId =
      newGroup.matchId && newGroup.matchId !== '__ALL__'
        ? newGroup.matchId
        : selectedMatchId && selectedMatchId !== '__ALL__'
          ? selectedMatchId
          : ''
    if (!targetMatchId) {
      setError('組を紐づける試合を選択してください。')
      return
    }
    if (!newGroup.name.trim()) {
      setError('組の名称を入力してください。')
      return
    }

    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await createGroup({
        matchId: targetMatchId,
        name: newGroup.name.trim(),
        order: Number.isFinite(Number(newGroup.order))
          ? Number(newGroup.order)
          : (selectedMatch?.groups.length ?? 0) + 1,
        startAt: parseDatetimeLocal(newGroup.startAt),
        endAt: parseDatetimeLocal(newGroup.endAt),
        isActive: newGroup.isActive
      })
      setStatus('組を追加しました。')
      setNewGroup({
        matchId: targetMatchId,
        name: '',
        order: (selectedMatch?.groups.length ?? 0) + 2,
        startAt: '',
        endAt: '',
        isActive: true
      })
    } catch (err) {
      console.error(err)
      setError('組の作成に失敗しました。入力内容を確認してください。')
    } finally {
      setPending(false)
    }
  }

  const handleUpdateGroup = async (
    groupId: string,
    updates: {
      name?: string
      order?: number
      isActive?: boolean
      startAt?: string
      endAt?: string
    }
  ) => {
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      const payload: Parameters<typeof updateGroupById>[1] = {}
      if (updates.name !== undefined) {
        payload.name = updates.name
      }
      if (updates.order !== undefined) {
        payload.order = updates.order
      }
      if (updates.isActive !== undefined) {
        payload.isActive = updates.isActive
      }
      if (updates.startAt !== undefined) {
        payload.startAt = parseDatetimeLocal(updates.startAt)
      }
      if (updates.endAt !== undefined) {
        payload.endAt = parseDatetimeLocal(updates.endAt)
      }
      await updateGroupById(groupId, payload)
      setStatus('組を更新しました。')
    } catch (err) {
      console.error(err)
      setError('組の更新に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    const targetMatch = selectedMatch ?? matchHierarchy.find((match) =>
      match.groups.some((group) => group.id === groupId)
    )
    const targetGroup = targetMatch?.groups.find((group) => group.id === groupId)
    if (!targetGroup) return
    const confirmation = window.confirm(`${targetGroup.name} を削除します。続行しますか？`)
    if (!confirmation) return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await deleteGroupById(groupId)
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null)
      }
      setStatus('組を削除しました。')
    } catch (err) {
      console.error(err)
      setError('組の削除に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleRuntimeUpdate = async (field: keyof RuntimeSettings, value: string) => {
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      const parsed = parseDatetimeLocal(value)
      await updateRuntimeSetting(field, parsed)
      setStatus('イベント時刻を更新しました。')
    } catch (err) {
      console.error(err)
      setError('イベント時刻の更新に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleFreezeToggle = async (frozen: boolean) => {
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await setFreezeState(frozen)
      setStatus(frozen ? '公開順位を凍結しました。' : '公開順位の凍結を解除しました。')
    } catch (err) {
      console.error(err)
      setError('凍結状態の更新に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleGenerateQr = async (expiresAt: string) => {
    if (!selectedLocation) return
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      const isoString = new Date(expiresAt).toISOString()
      const response = await generateSignedQr({
        locationId: selectedLocation.id,
        expiresAt: isoString
      })
      setQrPreview({
        locationId: selectedLocation.id,
        pngBase64: response.pngBase64,
        token: response.token,
        nonce: response.nonce
      })
      setStatus('署名付きQRを発行しました。')
    } catch (err) {
      console.error(err)
      setError('QRコードの発行に失敗しました。')
    } finally {
      setPending(false)
    }
  }

  const handleRoleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    const trimmedEmail = roleForm.email.trim()
    const trimmedUid = roleForm.uid.trim()
    if (!trimmedEmail && !trimmedUid) {
      setError('ロールを更新する対象のメールアドレスまたはUIDを入力してください。')
      return
    }
  if (
    roleForm.role === 'leader' &&
    (!roleForm.teamName.trim() ||
      !roleForm.teamTag.trim() ||
      !roleForm.matchId ||
      !roleForm.groupId)
  ) {
    setError('リーダーに設定する場合はチーム名・TeamTag・試合・組が必要です。')
    return
  }

  setPending(true)
  setStatus(null)
    setError(null)
    try {
      const response = await setUserRole({
        email: trimmedEmail || undefined,
        uid: trimmedUid || undefined,
        role: roleForm.role,
        teamName: roleForm.teamName.trim() || undefined,
        teamTag: roleForm.teamTag.trim() || undefined,
        matchId: roleForm.matchId || undefined,
        groupId: roleForm.groupId || undefined
      })
      const identifier = response.email ?? response.uid
      const roleLabel =
        response.role === 'leader'
          ? 'リーダー'
          : response.role === 'admin'
            ? '管理者'
            : 'ロールなし'
      const teamMessage =
        response.role === 'leader'
          ? response.teamUpdated
            ? '（チーム情報を更新しました）'
            : ''
          : ''
      setStatus(`ロールを更新しました: ${identifier} → ${roleLabel}${teamMessage}`)
      setRoleForm(createInitialRoleForm())
    } catch (err) {
      console.error(err)
      setError('ロールの更新に失敗しました。入力内容と権限を確認してください。')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card">
      <h2>管理者ダッシュボード</h2>

      {pending ? <LoadingSpinner label="処理中..." /> : null}
      {status ? <p className="status success">{status}</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      <section className="subsection">
        <h3>ユーザーロール管理</h3>
        <form className="grid grid-2" onSubmit={handleRoleSubmit}>
          <label className="form-field">
            <span>メールアドレス</span>
            <input
              type="email"
              value={roleForm.email}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  email: event.target.value
                }))
              }
              placeholder="user@example.com"
              disabled={pending}
            />
          </label>
          <label className="form-field">
            <span>UID（任意）</span>
            <input
              type="text"
              value={roleForm.uid}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  uid: event.target.value
                }))
              }
              placeholder="Firebase Auth UID"
              disabled={pending}
            />
          </label>
          <label className="form-field">
            <span>付与するロール</span>
            <select
              value={roleForm.role}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  role: event.target.value as RoleForm['role']
                }))
              }
              disabled={pending}
            >
              <option value="leader">leader（チーム用）</option>
              <option value="admin">admin（管理者）</option>
              <option value="none">ロール解除</option>
            </select>
          </label>
          <label className="form-field">
            <span>チーム名</span>
            <input
              type="text"
              value={roleForm.teamName}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  teamName: event.target.value
                }))
              }
              placeholder="例: 明和A班"
              disabled={pending || roleForm.role !== 'leader'}
              required={roleForm.role === 'leader'}
            />
          </label>
          <label className="form-field">
            <span>TeamTag</span>
            <input
              type="text"
              value={roleForm.teamTag}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  teamTag: event.target.value
                }))
              }
              placeholder="例: MEIWA-A"
              disabled={pending || roleForm.role !== 'leader'}
              required={roleForm.role === 'leader'}
            />
          </label>
          {roleForm.role === 'leader' ? (
            <>
              <label className="form-field">
                <span>試合</span>
                <select
                  value={roleForm.matchId}
                  onChange={(event) => {
                    const nextMatchId = event.target.value
                    setRoleForm((prev) => {
                      const match = matchHierarchy.find((item) => item.id === nextMatchId)
                      return {
                        ...prev,
                        matchId: nextMatchId,
                        groupId: match?.groups[0]?.id ?? ''
                      }
                    })
                  }}
                  disabled={pending || roleForm.role !== 'leader'}
                  required={roleForm.role === 'leader'}
                >
                  <option value="">選択してください</option>
                  {matchHierarchy.map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>組</span>
                <select
                  value={roleForm.groupId}
                  onChange={(event) =>
                    setRoleForm((prev) => ({
                      ...prev,
                      groupId: event.target.value
                    }))
                  }
                  disabled={
                    pending ||
                    roleForm.role !== 'leader' ||
                    !roleForm.matchId ||
                    groupsForRoleForm.length === 0
                  }
                  required={roleForm.role === 'leader'}
                >
                  <option value="">選択してください</option>
                  {groupsForRoleForm.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <div className="button-row">
            <button type="submit" disabled={pending}>
              ロールを更新
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setRoleForm(createInitialRoleForm())}
              disabled={pending}
            >
              入力内容をクリア
            </button>
          </div>
        </form>
        <p className="description">
          管理者権限を付与/解除できます。リーダーに設定する場合、チーム情報が `teams` コレクションに作成・更新されます。
          ロール変更後は対象ユーザーに再ログインしてもらい最新の権限を反映してください。
        </p>
</section>

      <section className="subsection">
        <h3>試合管理</h3>
        {matchesLoading ? (
          <LoadingSpinner label="試合を読み込み中..." />
        ) : matchesError ? (
          <p className="status error">試合データの取得に失敗しました。</p>
        ) : (
          <>
            {matchHierarchy.length === 0 ? (
              <p className="description">まだ試合が登録されていません。</p>
            ) : (
              <ul className="location-list">
                <li
                  key="match-all"
                  className={
                    isAllMatchesSelected
                      ? 'location-item active'
                      : 'location-item'
                  }
                >
                  <button
                    type="button"
                    className="location-select"
                    onClick={() => {
                      setSelectedMatchId((prev) => (prev === '__ALL__' ? null : '__ALL__'))
                      setSelectedGroupId(null)
                    }}
                  >
                    <div>
                      <strong>全ての試合</strong>
                      <span className="location-meta">ロケーション全件を表示</span>
                    </div>
                  </button>
                </li>
                {matchHierarchy.map((match) => (
                  <li
                    key={match.id}
                    className={
                      selectedMatchId === match.id
                        ? 'location-item active'
                        : 'location-item'
                    }
                  >
                    <button
                      type="button"
                      className="location-select"
                      onClick={() =>
                        setSelectedMatchId((prev) => (prev === match.id ? null : match.id))
                      }
                    >
                      <div>
                        <strong>{match.name}</strong>
                        <span className="location-meta">
                          順番: {match.order} / 組数: {match.groups.length}{' '}
                          <span className={`status-pill ${match.isActive ? 'active' : 'inactive'}`}>
                            <span className="status-dot" aria-hidden="true" />
                            {match.isActive ? '有効' : '無効'}
                          </span>
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {isAllMatchesSelected || !selectedMatch ? (
              <p className="description">試合を選択すると詳細を編集できます。</p>
            ) : (
              <div className="grid grid-2">
                <label className="form-field">
                  <span>試合名</span>
                  <input
                    type="text"
                    defaultValue={selectedMatch.name}
                    onBlur={(event) => handleUpdateMatch({ name: event.target.value })}
                    disabled={pending}
                  />
                </label>
                <label className="form-field">
                  <span>表示順</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={selectedMatch.order}
                    onBlur={(event) =>
                      handleUpdateMatch({ order: Number(event.target.value) || selectedMatch.order })
                    }
                    disabled={pending}
                  />
                </label>
                <div className="form-field">
                  <span>ステータス</span>
                  <button
                    type="button"
                    className={`toggle-pill ${selectedMatch.isActive ? 'active' : 'inactive'}`}
                    aria-pressed={selectedMatch.isActive}
                    onClick={() => handleUpdateMatch({ isActive: !selectedMatch.isActive })}
                    disabled={pending}
                  >
                    <span className="status-dot" aria-hidden="true" />
                    {selectedMatch.isActive ? '有効' : '無効'}
                  </button>
                </div>
                <div className="button-row">
                  <button type="button" className="danger" onClick={handleDeleteMatch} disabled={pending}>
                    試合を削除
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <form className="grid grid-2" onSubmit={handleCreateMatch}>
          <label className="form-field">
            <span>新規試合名</span>
            <input
              type="text"
              value={newMatch.name}
              onChange={(event) =>
                setNewMatch((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
              placeholder="例: 第1試合"
              disabled={pending || matchesLoading}
              required
            />
          </label>
          <label className="form-field">
            <span>表示順</span>
            <input
              type="number"
              min={1}
              value={newMatch.order}
              onChange={(event) =>
                setNewMatch((prev) => ({
                  ...prev,
                  order: Number(event.target.value) || 1
                }))
              }
              disabled={pending || matchesLoading}
              required
            />
          </label>
          <div className="form-field">
            <span>ステータス</span>
            <button
              type="button"
              className={`toggle-pill ${newMatch.isActive ? 'active' : 'inactive'}`}
              aria-pressed={newMatch.isActive}
              onClick={() =>
                setNewMatch((prev) => ({
                  ...prev,
                  isActive: !prev.isActive
                }))
              }
              disabled={pending || matchesLoading}
            >
              <span className="status-dot" aria-hidden="true" />
              {newMatch.isActive ? '有効' : '無効'}
            </button>
          </div>
          <div className="button-row">
            <button type="submit" disabled={pending || matchesLoading}>
              試合を追加
            </button>
          </div>
        </form>
      </section>

      <section className="subsection">
        <h3>組管理</h3>
        {matchesLoading ? (
          <LoadingSpinner label="組を読み込み中..." />
        ) : matchesError ? (
          <p className="status error">組データの取得に失敗しました。</p>
        ) : isAllMatchesSelected || !selectedMatch ? (
          <p className="description">試合を選択すると組を表示・編集できます。</p>
        ) : (
          <>
            {selectedMatch.groups.length === 0 ? (
              <p className="description">まだ組が登録されていません。</p>
            ) : (
              <ul className="location-list">
                {selectedMatch.groups.map((group) => (
                  <li
                    key={group.id}
                    className={selectedGroupId === group.id ? 'location-item active' : 'location-item'}
                  >
                    <button
                      type="button"
                      className="location-select"
                      onClick={() =>
                        setSelectedGroupId((prev) => (prev === group.id ? null : group.id))
                      }
                    >
                      <div>
                        <strong>{group.name}</strong>
                        <span className="location-meta">
                          順番: {group.order}{' '}
                          <span className={`status-pill ${group.isActive ? 'active' : 'inactive'}`}>
                            <span className="status-dot" aria-hidden="true" />
                            {group.isActive ? '有効' : '無効'}
                          </span>
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedGroup ? (
              <div className="grid grid-2">
                <label className="form-field">
                  <span>組名</span>
                  <input
                    type="text"
                    defaultValue={selectedGroup.name}
                    onBlur={(event) => handleUpdateGroup(selectedGroup.id, { name: event.target.value })}
                    disabled={pending}
                  />
                </label>
                <label className="form-field">
                  <span>表示順</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={selectedGroup.order}
                    onBlur={(event) =>
                      handleUpdateGroup(selectedGroup.id, {
                        order: Number(event.target.value) || selectedGroup.order
                      })
                    }
                    disabled={pending}
                  />
                </label>
                <label className="form-field">
                  <span>開始時刻</span>
                  <input
                    type="datetime-local"
                    defaultValue={toDatetimeLocal(selectedGroup.startAt)}
                    onBlur={(event) => handleUpdateGroup(selectedGroup.id, { startAt: event.target.value })}
                    disabled={pending}
                  />
                </label>
                <label className="form-field">
                  <span>終了時刻（任意）</span>
                  <input
                    type="datetime-local"
                    defaultValue={toDatetimeLocal(selectedGroup.endAt)}
                    onBlur={(event) => handleUpdateGroup(selectedGroup.id, { endAt: event.target.value })}
                    disabled={pending}
                  />
                </label>
                <div className="form-field">
                  <span>ステータス</span>
                  <button
                    type="button"
                    className={`toggle-pill ${selectedGroup.isActive ? 'active' : 'inactive'}`}
                    aria-pressed={selectedGroup.isActive}
                    onClick={() =>
                      handleUpdateGroup(selectedGroup.id, { isActive: !selectedGroup.isActive })
                    }
                    disabled={pending}
                  >
                    <span className="status-dot" aria-hidden="true" />
                    {selectedGroup.isActive ? '有効' : '無効'}
                  </button>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    disabled={pending}
                  >
                    組を削除
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
        <form className="grid grid-2" onSubmit={handleCreateGroup}>
          <label className="form-field">
            <span>親試合</span>
            <input
              type="text"
              value={selectedMatch?.name ?? '未選択'}
              readOnly
              disabled
            />
          </label>
          <label className="form-field">
            <span>組名</span>
            <input
              type="text"
              value={newGroup.name}
              onChange={(event) =>
                setNewGroup((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
              placeholder="例: 第1組"
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
              required
            />
          </label>
          <label className="form-field">
            <span>表示順</span>
            <input
              type="number"
              min={1}
              value={newGroup.order}
              onChange={(event) =>
                setNewGroup((prev) => ({
                  ...prev,
                  order: Number(event.target.value) || 1
                }))
              }
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
              required
            />
          </label>
          <label className="form-field">
            <span>開始時刻</span>
            <input
              type="datetime-local"
              value={newGroup.startAt}
              onChange={(event) =>
                setNewGroup((prev) => ({
                  ...prev,
                  startAt: event.target.value
                }))
              }
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
            />
          </label>
          <label className="form-field">
            <span>終了時刻（任意）</span>
            <input
              type="datetime-local"
              value={newGroup.endAt}
              onChange={(event) =>
                setNewGroup((prev) => ({
                  ...prev,
                  endAt: event.target.value
                }))
              }
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
            />
          </label>
          <div className="form-field">
            <span>ステータス</span>
            <button
              type="button"
              className={`toggle-pill ${newGroup.isActive ? 'active' : 'inactive'}`}
              aria-pressed={newGroup.isActive}
              onClick={() =>
                setNewGroup((prev) => ({
                  ...prev,
                  isActive: !prev.isActive
                }))
              }
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
            >
              <span className="status-dot" aria-hidden="true" />
              {newGroup.isActive ? '有効' : '無効'}
            </button>
          </div>
          <div className="button-row">
            <button
              type="submit"
              disabled={pending || matchesLoading || !selectedMatch || isAllMatchesSelected}
            >
              組を追加
            </button>
          </div>
        </form>
      </section>

      <section className="subsection">
        <h3>イベント時刻</h3>
        {runtimeLoading ? (
          <LoadingSpinner label="読み込み中..." />
        ) : runtimeError ? (
          <p className="status error">設定の取得に失敗しました。</p>
        ) : (
          <div className="grid grid-3">
            <label className="form-field">
              <span>開始</span>
              <input
                type="datetime-local"
                defaultValue={toDatetimeLocal(runtimeDoc?.eventStart ?? null)}
                onBlur={(event) => handleRuntimeUpdate('eventStart', event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>凍結</span>
              <input
                type="datetime-local"
                defaultValue={toDatetimeLocal(runtimeDoc?.freezeAt ?? null)}
                onBlur={(event) => handleRuntimeUpdate('freezeAt', event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>終了</span>
              <input
                type="datetime-local"
                defaultValue={toDatetimeLocal(runtimeDoc?.eventEnd ?? null)}
                onBlur={(event) => handleRuntimeUpdate('eventEnd', event.target.value)}
              />
            </label>
          </div>
        )}
        <div className="button-row">
          <button type="button" onClick={() => handleFreezeToggle(true)}>
            順位表を凍結
          </button>
          <button type="button" className="secondary" onClick={() => handleFreezeToggle(false)}>
            凍結解除
          </button>
        </div>
      </section>

      <section className="subsection">
        <h3>ロケーション一覧</h3>
        {locationsLoading ? (
          <LoadingSpinner label="読み込み中..." />
        ) : locationsError ? (
          <p className="status error">ロケーションの取得に失敗しました。</p>
        ) : locations.length === 0 ? (
          <p className="description">まだロケーションが登録されていません。</p>
        ) : (
          <ul className="location-list">
            {locations.map((location) => (
              <li
                key={location.id}
                className={selectedLocationId === location.id ? 'location-item active' : 'location-item'}
              >
                <button
                  type="button"
                  className="location-select"
                  onClick={() =>
                    setSelectedLocationId((prev) => (prev === location.id ? null : location.id))
                  }
                >
                  <div>
                    <strong>{location.title}</strong>
                    <span className="location-meta">
                      試合:{' '}
                      {location.matchId
                        ? matchNameMap.get(location.matchId) ?? location.matchId
                        : '未割当'}{' '}
                      / 難易度: {location.difficulty} / 基礎点: {location.basePoints} /{' '}
                      <span
                        className={`status-pill ${location.isActive ? 'active' : 'inactive'}`}
                      >
                        <span className="status-dot" aria-hidden="true" />
                        {location.isActive ? '有効' : '無効'}
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedLocation ? (
        <section className="subsection">
          <h3>ロケーション編集: {selectedLocation.title}</h3>
          <div className="grid grid-2">
            <label className="form-field">
              <span>タイトル</span>
              <input
                type="text"
                defaultValue={selectedLocation.title}
                onBlur={(event) => handleUpdateLocation({ title: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>試合</span>
              <select
                defaultValue={selectedLocation.matchId ?? ''}
                onChange={(event) =>
                  handleUpdateLocation({
                    matchId: event.target.value ? event.target.value : null
                  })
                }
                disabled={pending || matchesLoading}
              >
                <option value="">未割当</option>
                {matchHierarchy.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>箱キーワード</span>
              <input
                type="text"
                defaultValue={selectedLocation.boxKeyword}
                onBlur={(event) => handleUpdateLocation({ boxKeyword: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>難易度</span>
              <input
                type="number"
                min={1}
                max={5}
                defaultValue={selectedLocation.difficulty}
                onBlur={(event) =>
                  handleUpdateLocation({ difficulty: Number(event.target.value) })
                }
              />
            </label>
            <label className="form-field">
              <span>基礎点</span>
              <input
                type="number"
                min={10}
                step={10}
                defaultValue={selectedLocation.basePoints}
                onBlur={(event) =>
                  handleUpdateLocation({ basePoints: Number(event.target.value) })
                }
              />
            </label>
            <div className="form-field">
              <span>ステータス</span>
              <button
                type="button"
                className={`toggle-pill ${selectedLocation.isActive ? 'active' : 'inactive'}`}
                aria-pressed={selectedLocation.isActive}
                onClick={() => handleUpdateLocation({ isActive: !selectedLocation.isActive })}
                disabled={pending}
              >
                <span className="status-dot" aria-hidden="true" />
                {selectedLocation.isActive ? '有効' : '無効'}
              </button>
            </div>
          </div>
          <div className="button-row">
            <button type="button" className="danger" onClick={handleDeleteLocation}>
              削除
            </button>
          </div>

          <fieldset className="qr-section">
            <legend>署名付きQR発行</legend>
            <label className="form-field">
              <span>有効期限 (ISO8601)</span>
              <input
                type="datetime-local"
                onBlur={(event) => {
                  if (event.target.value) {
                    handleGenerateQr(event.target.value)
                  }
                }}
              />
            </label>
            {qrPreview && qrPreview.locationId === selectedLocation.id ? (
              <div className="qr-preview">
                <img
                  src={`data:image/png;base64,${qrPreview.pngBase64}`}
                  alt="署名付きQRコード"
                />
                <div className="qr-meta">
                  <p>
                    <strong>token:</strong> <code>{qrPreview.token}</code>
                  </p>
                  <p>
                    <strong>nonce:</strong> <code>{qrPreview.nonce}</code>
                  </p>
                </div>
              </div>
            ) : null}
          </fieldset>
        </section>
      ) : null}

      <section className="subsection">
        <h3>ロケーション追加</h3>
        <form onSubmit={handleCreateLocation} className="grid grid-2">
          <label className="form-field">
            <span>試合</span>
            <select
              value={newLocation.matchId}
              onChange={(event) =>
                setNewLocation((prev) => ({
                  ...prev,
                  matchId: event.target.value
                }))
              }
              disabled={pending || matchesLoading}
              required
            >
              <option value="">選択してください</option>
              {matchHierarchy.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>タイトル</span>
            <input
              type="text"
              value={newLocation.title}
              onChange={(event) =>
                setNewLocation((prev) => ({
                  ...prev,
                  title: event.target.value
                }))
              }
              required
            />
          </label>
          <label className="form-field">
            <span>箱キーワード</span>
            <input
              type="text"
              value={newLocation.boxKeyword}
              onChange={(event) =>
                setNewLocation((prev) => ({
                  ...prev,
                  boxKeyword: event.target.value
                }))
              }
              required
            />
          </label>
          <label className="form-field">
            <span>難易度</span>
            <input
              type="number"
              min={1}
              max={5}
              value={newLocation.difficulty}
              onChange={(event) =>
                setNewLocation((prev) => ({
                  ...prev,
                  difficulty: Number(event.target.value)
                }))
              }
              required
            />
          </label>
          <label className="form-field">
            <span>基礎点</span>
            <input
              type="number"
              min={10}
              step={10}
              value={newLocation.basePoints}
              onChange={(event) =>
                setNewLocation((prev) => ({
                  ...prev,
                  basePoints: Number(event.target.value)
                }))
              }
              required
            />
          </label>
          <div className="form-field">
            <span>ステータス</span>
            <button
              type="button"
              className={`toggle-pill ${newLocation.isActive ? 'active' : 'inactive'}`}
              aria-pressed={newLocation.isActive}
              onClick={() =>
                setNewLocation((prev) => ({
                  ...prev,
                  isActive: !prev.isActive
                }))
              }
              disabled={pending}
            >
              <span className="status-dot" aria-hidden="true" />
              {newLocation.isActive ? '有効' : '無効'}
            </button>
          </div>
          <div className="button-row">
            <button type="submit" disabled={pending || !newLocation.matchId}>
              追加
            </button>
          </div>
        </form>
      </section>
    </section>
  )
}

export default AdminDashboard

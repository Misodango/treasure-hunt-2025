import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import LoadingSpinner from './LoadingSpinner'
import { useLocations } from '../hooks/useLocations'
import { useRuntimeSettings } from '../hooks/useRuntimeSettings'
import {
  createLocation,
  deleteLocationById,
  generateSignedQr,
  setFreezeState,
  setUserRole,
  updateLocationById,
  updateRuntimeSetting
} from '../lib/admin'
import type { LocationDoc } from '../hooks/useLocations'
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
}

const toDate = (value: RuntimeSettings[keyof RuntimeSettings]) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if ('toDate' in value && typeof value.toDate === 'function') return value.toDate()
  return null
}

const toDatetimeLocal = (value: RuntimeSettings[keyof RuntimeSettings]) => {
  const date = toDate(value)
  if (!date) return ''
  const tzOffset = date.getTimezoneOffset() * 60000
  const local = new Date(date.getTime() - tzOffset)
  return local.toISOString().slice(0, 16)
}

const parseDatetimeLocal = (value: string) => (value ? new Date(value) : null)

const AdminDashboard = () => {
  const { data: locations, loading: locationsLoading, error: locationsError } = useLocations()
  const {
    data: runtimeDoc,
    loading: runtimeLoading,
    error: runtimeError
  } = useRuntimeSettings()

  const [newLocation, setNewLocation] = useState({
    title: '',
    difficulty: 1,
    basePoints: 100,
    boxKeyword: '',
    isActive: true
  })

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
    teamTag: ''
  })
  const [roleForm, setRoleForm] = useState<RoleForm>(() => createInitialRoleForm())

  const handleCreateLocation = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault()
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      await createLocation(newLocation)
      setStatus('ロケーションを追加しました。')
      setNewLocation({
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

  const handleUpdateLocation = async (updates: Partial<LocationDoc>) => {
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
      (!roleForm.teamName.trim() || !roleForm.teamTag.trim())
    ) {
      setError('リーダーに設定する場合はチーム名とTeamTagが必要です。')
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
        teamTag: roleForm.teamTag.trim() || undefined
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
                      難易度: {location.difficulty} / 基礎点: {location.basePoints} /{' '}
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
            <button type="submit">追加</button>
          </div>
        </form>
      </section>
    </section>
  )
}

export default AdminDashboard

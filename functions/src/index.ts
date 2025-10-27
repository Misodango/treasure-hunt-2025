import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { logger, config } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore
} from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'

initializeApp()


const isEmulatorEnvironment = (): boolean => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return true
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return true
  if (process.env.GCLOUD_PROJECT === 'demo-project') return true
  return false
}

const resolveAdminUid = (): string | undefined => {
  try {
    const cfg = config()
    const fromFunctionsConfig =
      (cfg.admin?.uid as string | undefined) ??
      (cfg.app?.admin_uid as string | undefined) ??
      (cfg.app?.adminUid as string | undefined)
    if (fromFunctionsConfig) return fromFunctionsConfig
  } catch (error) {
    logger.warn('Unable to read admin UID from functions config', error)
  }

  const envKeys = ['ADMIN_UID', 'APP_ADMIN_UID', 'APP__ADMIN_UID']
  for (const key of envKeys) {
    const value = process.env[key]
    if (value) return value
  }
  return undefined
}

const ensureAdminRole = async () => {
  if (isEmulatorEnvironment()) {
    logger.info('Emulator environment detected; skipping ensureAdminRole bootstrap')
    return
  }

  const adminUid = resolveAdminUid()
  if (!adminUid) {
    logger.warn('ADMIN_UID env var is not set; skipping admin role bootstrap')
    return
  }
  try {
    const auth = getAuth()
    const userRecord = await auth.getUser(adminUid)
    const existingClaims = userRecord.customClaims ?? {}
    if (existingClaims.role === 'admin') return

    await auth.setCustomUserClaims(adminUid, {
      ...existingClaims,
      role: 'admin'
    })
    logger.info(`Ensured admin role for uid=${adminUid}`)
  } catch (error) {
    const code = (error as { errorInfo?: { code?: string } }).errorInfo?.code
    if (code === 'app/invalid-credential') {
      logger.warn('Skipping ensure admin role due to missing credentials. Configure GOOGLE_APPLICATION_CREDENTIALS when deploying.')
    } else {
      logger.error('Failed to ensure admin role', error)
    }
  }
}

void ensureAdminRole()

const REGION = process.env.FUNCTION_REGION ?? 'asia-northeast1'
setGlobalOptions({ maxInstances: 10, region: REGION })

const db: Firestore = getFirestore()

const getQrSecret = (): string => {
  const secret = process.env.QR_SECRET
  if (!secret) {
    logger.error('QR_SECRET is not configured')
    throw new HttpsError(
      'failed-precondition',
      'QR secret is not configured on the server.'
    )
  }
  return secret
}

const signPayload = (payload: string): string => {
  const secret = getQrSecret()
  return createHmac('sha256', secret).update(payload).digest('hex')
}

const requireRole = (request: CallableRequest<unknown>, roles: Array<'admin' | 'leader'>) => {
  const uid = request.auth?.uid
  const role = request.auth?.token?.role as string | undefined
  if (!uid || !role || !roles.includes(role as 'admin' | 'leader')) {
    throw new HttpsError('permission-denied', 'Insufficient permissions.')
  }
  return { uid, role: role as 'admin' | 'leader' }
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

type GenerateQrPayload = {
  locationId?: string
  expiresAt?: string
}

type SetUserRolePayload = {
  uid?: string
  email?: string
  role?: 'leader' | 'admin' | 'none'
  teamName?: string
  teamTag?: string
  matchId?: string
  groupId?: string
}

type SetUserRoleResponse = {
  uid: string
  email: string | null
  role: 'leader' | 'admin' | null
  teamUpdated: boolean
}

type MatchDoc = {
  name?: string
  order?: number
  isActive?: boolean
}

type GroupDoc = {
  matchId?: string
  name?: string
  order?: number
  startAt?: Timestamp
  endAt?: Timestamp
  isActive?: boolean
}

const sanitizeRole = (input: string | undefined | null): 'leader' | 'admin' | 'none' | null => {
  if (!input) return null
  if (input === 'leader' || input === 'admin' || input === 'none') return input
  return null
}

export const setUserRole = onCall<SetUserRolePayload>(async (request) => {
  requireRole(request, ['admin'])

  const { uid: rawUid, email: rawEmail, role, teamName, teamTag } = request.data ?? {}
  const targetRole = sanitizeRole(role)
  if (!targetRole) {
    throw new HttpsError('invalid-argument', 'role must be one of leader, admin, none.')
  }

  const trimmedUid = typeof rawUid === 'string' ? rawUid.trim() : ''
  const trimmedEmail = typeof rawEmail === 'string' ? rawEmail.trim() : ''
  if (!trimmedUid && !trimmedEmail) {
    throw new HttpsError('invalid-argument', 'uid or email is required.')
  }

  const auth = getAuth()
  let userRecord
  try {
    if (trimmedUid) {
      userRecord = await auth.getUser(trimmedUid)
    } else if (trimmedEmail) {
      userRecord = await auth.getUserByEmail(trimmedEmail)
    } else {
      throw new HttpsError('invalid-argument', 'Unable to resolve target user.')
    }
  } catch (error) {
    logger.warn('Failed to locate user for role assignment', { trimmedUid, trimmedEmail, error })
    throw new HttpsError('not-found', 'User not found.')
  }

  let teamUpdated = false
  if (targetRole === 'leader') {
    const safeTeamName = typeof teamName === 'string' ? teamName.trim() : ''
    const safeTeamTag = typeof teamTag === 'string' ? teamTag.trim() : ''
    if (!safeTeamName || !safeTeamTag) {
      throw new HttpsError(
        'invalid-argument',
        'teamName and teamTag are required when assigning leader role.'
      )
    }
    const safeMatchId = typeof request.data?.matchId === 'string' ? request.data.matchId.trim() : ''
    const safeGroupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : ''
    if (!safeMatchId || !safeGroupId) {
      throw new HttpsError(
        'invalid-argument',
        'matchId and groupId are required when assigning leader role.'
      )
    }

    const matchRef = db.collection('matches').doc(safeMatchId)
    const groupRef = db.collection('groups').doc(safeGroupId)
    const [matchSnap, groupSnap] = await Promise.all([matchRef.get(), groupRef.get()])
    if (!matchSnap.exists) {
      throw new HttpsError('invalid-argument', 'Assigned match not found.')
    }
    if (!groupSnap.exists) {
      throw new HttpsError('invalid-argument', 'Assigned group not found.')
    }
    const matchData = (matchSnap.data() ?? {}) as MatchDoc
    const groupData = (groupSnap.data() ?? {}) as GroupDoc
    if (groupData.matchId !== safeMatchId) {
      throw new HttpsError('invalid-argument', 'Group does not belong to the selected match.')
    }

    const teamRef = db.collection('teams').doc(userRecord.uid)
    const teamSnap = await teamRef.get()
    const now = Timestamp.now()
    const teamData: Record<string, unknown> = {
      name: safeTeamName,
      teamTag: safeTeamTag,
      leaderEmail: userRecord.email ?? null,
      matchId: safeMatchId,
      matchName: matchData.name ?? null,
      groupId: safeGroupId,
      groupName: groupData.name ?? null,
      updatedAt: now
    }
    if (!teamSnap.exists) {
      teamData.score = 0
      teamData.createdAt = now
    }
    await teamRef.set(teamData, { merge: true })
    teamUpdated = true
  }

  const existingClaims = userRecord.customClaims ?? {}
  const nextClaims: Record<string, unknown> = { ...existingClaims }
  if (targetRole === 'none') {
    delete nextClaims.role
  } else {
    nextClaims.role = targetRole
  }

  await auth.setCustomUserClaims(userRecord.uid, nextClaims)

  logger.info('Updated user role', {
    uid: userRecord.uid,
    email: userRecord.email,
    newRole: targetRole === 'none' ? null : targetRole
  })

  await updatePublicLeaderboard().catch((error) => {
    logger.error('Failed to refresh leaderboard after role update', error)
  })

  const response: SetUserRoleResponse = {
    uid: userRecord.uid,
    email: userRecord.email ?? null,
    role: targetRole === 'none' ? null : targetRole,
    teamUpdated
  }
  return response
})

export const generateLocationQr = onCall<GenerateQrPayload>(async (request) => {
  requireRole(request, ['admin'])

  const { locationId, expiresAt } = request.data ?? {}
  if (!locationId || typeof locationId !== 'string') {
    throw new HttpsError('invalid-argument', 'locationId is required.')
  }
  if (!expiresAt || typeof expiresAt !== 'string') {
    throw new HttpsError('invalid-argument', 'expiresAt (ISO string) is required.')
  }

  const expiration = new Date(expiresAt)
  if (Number.isNaN(expiration.getTime()) || expiration.getTime() <= Date.now()) {
    throw new HttpsError('invalid-argument', 'expiresAt must be a future timestamp.')
  }

  const locationSnap = await db.collection('locations').doc(locationId).get()
  if (!locationSnap.exists) {
    throw new HttpsError('not-found', 'Location not found.')
  }

  const nonce = randomBytes(16).toString('hex')
  const expEpoch = expiration.getTime()
  const payload = `${locationId}|${nonce}|${expEpoch}`
  const signature = signPayload(payload)
  const token = `${payload}|${signature}`
  const qrDataUrl = await QRCode.toDataURL(token, {
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'M'
  })
  const pngBase64 = qrDataUrl.split(',')[1] ?? ''

  return {
    token,
    nonce,
    pngBase64
  }
})

type ClaimPayload = {
  token?: string
  providedKeyword?: string
  providedTeamTag?: string
}

const parseToken = (token: string) => {
  const parts = token.split('|')
  if (parts.length !== 4) {
    throw new HttpsError('invalid-argument', 'Invalid token format.')
  }
  const [locationId, nonce, exp, signature] = parts
  const payload = `${locationId}|${nonce}|${exp}`
  const expectedSignature = signPayload(payload)
  if (!cryptoSafeEqual(signature, expectedSignature)) {
    throw new HttpsError('permission-denied', 'Invalid token signature.')
  }
  const expNumber = Number(exp)
  if (!Number.isFinite(expNumber)) {
    throw new HttpsError('invalid-argument', 'Invalid token expiration.')
  }
  if (Date.now() > expNumber) {
    throw new HttpsError('permission-denied', 'Token has expired.')
  }
  return { locationId, nonce, expMillis: expNumber }
}

const cryptoSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  const buffA = Buffer.from(a)
  const buffB = Buffer.from(b)
  return buffA.length === buffB.length && timingSafeEqual(buffA, buffB)
}

const computePoints = (location: Record<string, unknown>): number => {
  const basePoints = Number(location.basePoints ?? 0)
  const difficulty = Number(location.difficulty ?? 1)
  if (!Number.isFinite(basePoints) || basePoints <= 0) {
    throw new HttpsError('failed-precondition', 'Location points are not configured.')
  }
  return Math.max(0, Math.round(basePoints * (difficulty > 0 ? difficulty : 1)))
}

export const claim = onCall<ClaimPayload>(async (request) => {
  const { uid, role } = requireRole(request, ['leader', 'admin'])
  const { token, providedKeyword, providedTeamTag } = request.data ?? {}

  if (!token || typeof token !== 'string') {
    throw new HttpsError('invalid-argument', 'token is required.')
  }
  if (!providedKeyword || typeof providedKeyword !== 'string') {
    throw new HttpsError('invalid-argument', 'providedKeyword is required.')
  }
  if (!providedTeamTag || typeof providedTeamTag !== 'string') {
    throw new HttpsError('invalid-argument', 'providedTeamTag is required.')
  }

  const tokenInfo = parseToken(token)
  const teamRef = db.collection('teams').doc(uid)
  const locationRef = db.collection('locations').doc(tokenInfo.locationId)

  let awardedPoints = 0

  await db.runTransaction(async (tx) => {
    const [teamSnap, locationSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(locationRef)
    ])

    if (!teamSnap.exists) {
      throw new HttpsError('failed-precondition', 'Team not found.')
    }
    if (!locationSnap.exists) {
      throw new HttpsError('not-found', 'Location not found.')
    }

    const teamData = teamSnap.data() ?? {}
    const locationData = locationSnap.data() ?? {}

    const teamMatchId = (teamData.matchId as string | undefined) ?? null
    const locationMatchId = (locationData.matchId as string | undefined) ?? null
    if (teamMatchId && locationMatchId && teamMatchId !== locationMatchId) {
      throw new HttpsError('permission-denied', 'Location does not belong to the team match.')
    }

    if (teamData.teamTag !== providedTeamTag) {
      throw new HttpsError('permission-denied', 'Invalid team tag.')
    }
    if (locationData.boxKeyword !== providedKeyword) {
      throw new HttpsError('permission-denied', 'Invalid keyword.')
    }
    if (locationData.isActive === false) {
      throw new HttpsError('failed-precondition', 'Location is inactive.')
    }

    const solvedMap: Record<string, unknown> = teamData.solved ?? {}
    if (solvedMap[tokenInfo.locationId]) {
      throw new HttpsError('already-exists', 'Location already solved by this team.')
    }

    awardedPoints = computePoints(locationData)

    tx.update(teamRef, {
      score: FieldValue.increment(awardedPoints),
      [`solved.${tokenInfo.locationId}`]: {
        at: Timestamp.now(),
        points: awardedPoints
      },
      updatedAt: Timestamp.now()
    })

    tx.set(
      db
        .collection('claims')
        .doc(),
      {
        teamId: uid,
        locationId: tokenInfo.locationId,
        points: awardedPoints,
        processedAt: Timestamp.now(),
        processedBy: role
      }
    )
  })

  await updatePublicLeaderboard().catch((error) => {
    logger.error('Failed to update public leaderboard', error)
  })

  return {
    locationId: tokenInfo.locationId,
    pointsAwarded: awardedPoints,
    processedAt: new Date().toISOString()
  }
})

type FreezePayload = {
  frozen?: boolean
}

export const setFreezeState = onCall<FreezePayload>(async (request) => {
  requireRole(request, ['admin'])
  const { frozen } = request.data ?? {}
  if (typeof frozen !== 'boolean') {
    throw new HttpsError('invalid-argument', 'frozen must be boolean.')
  }
  await db.collection('settings').doc('runtime').set(
    {
      freezeOverride: frozen,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  )
  return { ok: true }
})

type ScoreboardTeamEntry = {
  teamId: string
  teamName: string
  score: number
  lastSolveAt: Timestamp | null
  elapsedSeconds: number | null
  solvedCount: number
}

type ScoreboardGroup = {
  id: string
  matchId: string
  name: string
  order: number
  startAt: Timestamp | null
  endAt: Timestamp | null
  isActive: boolean
  entries: ScoreboardTeamEntry[]
}

type ScoreboardMatch = {
  id: string
  name: string
  order: number
  isActive: boolean
  groups: Map<string, ScoreboardGroup>
}

const createFallbackStructures = () => {
  const fallbackMatch: ScoreboardMatch = {
    id: '__unassigned__',
    name: '未割当',
    order: Number.MAX_SAFE_INTEGER,
    isActive: true,
    groups: new Map()
  }
  const fallbackGroup: ScoreboardGroup = {
    id: '__unassigned__',
    matchId: fallbackMatch.id,
    name: '未割当',
    order: Number.MAX_SAFE_INTEGER,
    startAt: null,
    endAt: null,
    isActive: true,
    entries: []
  }
  fallbackMatch.groups.set(fallbackGroup.id, fallbackGroup)
  return { fallbackMatch, fallbackGroup }
}

const updatePublicLeaderboard = async () => {
  const [matchesSnapshot, groupsSnapshot, teamsSnapshot, runtimeSnap] = await Promise.all([
    db.collection('matches').get(),
    db.collection('groups').get(),
    db.collection('teams').get(),
    db.collection('settings').doc('runtime').get()
  ])

  const matchMap = new Map<string, ScoreboardMatch>()
  for (const docSnap of matchesSnapshot.docs) {
    const data = (docSnap.data() ?? {}) as MatchDoc
    matchMap.set(docSnap.id, {
      id: docSnap.id,
      name: typeof data.name === 'string' && data.name.trim() ? data.name : docSnap.id,
      order:
        typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER - 1,
      isActive: data.isActive !== false,
      groups: new Map()
    })
  }

  const groupMap = new Map<string, ScoreboardGroup>()
  for (const docSnap of groupsSnapshot.docs) {
    const data = (docSnap.data() ?? {}) as GroupDoc
    const matchId = typeof data.matchId === 'string' ? data.matchId : null
    if (!matchId) {
      logger.warn('Group without matchId skipped in leaderboard', { groupId: docSnap.id })
      continue
    }
    const parentMatch = matchMap.get(matchId)
    if (!parentMatch) {
      logger.warn('Group referencing missing match skipped in leaderboard', {
        groupId: docSnap.id,
        matchId
      })
      continue
    }
    const group: ScoreboardGroup = {
      id: docSnap.id,
      matchId,
      name: typeof data.name === 'string' && data.name.trim() ? data.name : docSnap.id,
      order:
        typeof data.order === 'number' && Number.isFinite(data.order)
          ? data.order
          : Number.MAX_SAFE_INTEGER - 1,
      startAt: data.startAt instanceof Timestamp ? data.startAt : null,
      endAt: data.endAt instanceof Timestamp ? data.endAt : null,
      isActive: data.isActive !== false,
      entries: []
    }
    parentMatch.groups.set(group.id, group)
    groupMap.set(group.id, group)
  }

  const { fallbackGroup, fallbackMatch } = createFallbackStructures()
  let hasFallbackEntries = false

  for (const docSnap of teamsSnapshot.docs) {
    const data = docSnap.data() ?? {}
    const matchId = typeof data.matchId === 'string' ? data.matchId : null
    const groupId = typeof data.groupId === 'string' ? data.groupId : null
    const matchEntry = matchId ? matchMap.get(matchId) : undefined
    const groupEntry = groupId ? groupMap.get(groupId) : undefined

    const targetGroup = groupEntry ?? fallbackGroup
    // const targetMatch = groupEntry ? matchEntry : fallbackMatch
    if (!groupEntry) {
      hasFallbackEntries = true
    } else if (!matchEntry) {
      hasFallbackEntries = true
    }

    if (!matchEntry && groupEntry) {
      // Ensure the referenced match exists in the leaderboard structure when group exists.
      const missingMatch = matchMap.get(groupEntry.matchId)
      if (!missingMatch) {
        hasFallbackEntries = true
      }
    }

    const solved = (data.solved ?? {}) as Record<string, { at?: Timestamp }>
    const lastSolveAt = Object.values(solved).reduce<Timestamp | null>(
      (latest, entry) => {
        if (!entry?.at) return latest
        if (!latest || entry.at.toMillis() > latest.toMillis()) return entry.at
        return latest
      },
      null
    )
    const startAt = targetGroup.startAt
    const elapsedSeconds =
      startAt && lastSolveAt ? Math.max(0, Math.round((lastSolveAt.toMillis() - startAt.toMillis()) / 1000)) : null

    const entry: ScoreboardTeamEntry = {
      teamId: docSnap.id,
      teamName: typeof data.name === 'string' && data.name.trim() ? data.name : docSnap.id,
      score: Number.isFinite(Number(data.score)) ? Number(data.score) : 0,
      lastSolveAt,
      elapsedSeconds,
      solvedCount: Object.keys(solved).length
    }
    targetGroup.entries.push(entry)

    if (!matchEntry || !groupEntry) {
      fallbackMatch.groups.set(fallbackGroup.id, fallbackGroup)
      matchMap.set(fallbackMatch.id, fallbackMatch)
    }
  }

  const entrySorter = (a: ScoreboardTeamEntry, b: ScoreboardTeamEntry) => {
    if (b.score !== a.score) return b.score - a.score
    const aElapsed = typeof a.elapsedSeconds === 'number' ? a.elapsedSeconds : null
    const bElapsed = typeof b.elapsedSeconds === 'number' ? b.elapsedSeconds : null
    if (aElapsed !== null && bElapsed !== null && aElapsed !== bElapsed) {
      return aElapsed - bElapsed
    }
    if (aElapsed !== null && bElapsed === null) return -1
    if (aElapsed === null && bElapsed !== null) return 1
    if (a.lastSolveAt && b.lastSolveAt) {
      return a.lastSolveAt.toMillis() - b.lastSolveAt.toMillis()
    }
    if (a.lastSolveAt) return -1
    if (b.lastSolveAt) return 1
    return a.teamName.localeCompare(b.teamName)
  }

  const matches = Array.from(matchMap.values())
    .filter((match) => match.groups.size > 0)
    .map((match) => {
      const groups = Array.from(match.groups.values())
        .sort((a, b) => a.order - b.order)
        .map((group) => ({
          id: group.id,
          matchId: group.matchId,
          name: group.name,
          order: group.order,
          startAt: group.startAt,
          endAt: group.endAt,
          isActive: group.isActive,
          entries: group.entries.sort(entrySorter).map((entry) => ({
            teamId: entry.teamId,
            teamName: entry.teamName,
            score: entry.score,
            lastSolveAt: entry.lastSolveAt,
            elapsedSeconds: entry.elapsedSeconds,
            solvedCount: entry.solvedCount
          }))
        }))
      return {
        id: match.id,
        name: match.name,
        order: match.order,
        isActive: match.isActive,
        groups
      }
    })
    .sort((a, b) => a.order - b.order)

  const runtime = runtimeSnap.data() ?? {}
  const now = new Date()
  let masked = false

  if (runtime.freezeOverride === true) {
    masked = true
  } else {
    const freezeAt = toDate(runtime.freezeAt)
    const eventEnd = toDate(runtime.eventEnd)
    if (freezeAt && eventEnd && now >= freezeAt && now < eventEnd) {
      masked = true
    }
  }

  const payload: Record<string, unknown> = {
    schemaVersion: 2,
    matches,
    masked,
    updatedAt: Timestamp.now()
  }

  if (hasFallbackEntries) {
    payload.unassignedNotice = true
  } else {
    payload.unassignedNotice = false
  }

  await db.collection('leaderboard_public').doc('runtime').set(payload, { merge: true })
}

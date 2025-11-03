import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { getApp } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'

export type LocationInput = {
  title: string
  difficulty: number
  basePoints: number
  boxKeyword: string
  isActive: boolean
  matchId: string
}

export type LocationUpdateInput = Partial<Omit<LocationInput, 'matchId'>> & {
  matchId?: string | null
}

export const createLocation = (input: LocationInput) =>
  addDoc(collection(db, 'locations'), {
    ...input,
    createdAt: new Date()
  })

export const updateLocationById = (id: string, input: LocationUpdateInput) => {
  const payload = Object.fromEntries(
    Object.entries({
      ...input,
      updatedAt: new Date()
    }).filter(([, value]) => value !== undefined)
  )
  return updateDoc(doc(db, 'locations', id), payload)
}

export const deleteLocationById = (id: string) => deleteDoc(doc(db, 'locations', id))

export type MatchInput = {
  name: string
  order: number
  isActive: boolean
}

export const createMatch = (input: MatchInput) =>
  addDoc(collection(db, 'matches'), {
    ...input,
    createdAt: new Date(),
    updatedAt: new Date()
  })

export const updateMatchById = (id: string, input: Partial<MatchInput>) => {
  const payload = Object.fromEntries(
    Object.entries({
      ...input,
      updatedAt: new Date()
    }).filter(([, value]) => value !== undefined)
  )
  return updateDoc(doc(db, 'matches', id), payload)
}

export const deleteMatchById = (id: string) => deleteDoc(doc(db, 'matches', id))

export type GroupInput = {
  matchId: string
  name: string
  order: number
  startAt: Date | null
  endAt: Date | null
  isActive: boolean
}

const normalizeTemporalField = (value: Date | null | undefined) => {
  if (value === undefined) return undefined
  return value ?? null
}

export const createGroup = (input: GroupInput) =>
  addDoc(collection(db, 'groups'), {
    ...input,
    startAt: normalizeTemporalField(input.startAt),
    endAt: normalizeTemporalField(input.endAt),
    createdAt: new Date(),
    updatedAt: new Date()
  })

export const updateGroupById = (id: string, input: Partial<GroupInput>) => {
  const payload = Object.fromEntries(
    Object.entries({
      ...input,
      startAt: normalizeTemporalField(input.startAt),
      endAt: normalizeTemporalField(input.endAt),
      updatedAt: new Date()
    }).filter(([, value]) => value !== undefined)
  )
  return updateDoc(doc(db, 'groups', id), payload)
}

export const deleteGroupById = (id: string) => deleteDoc(doc(db, 'groups', id))

export type GenerateQrPayload = {
  locationId: string
  expiresAt: string
}

export type GenerateQrResponse = {
  token: string
  pngBase64: string
  nonce: string
}

export const generateSignedQr = async (
  payload: GenerateQrPayload
): Promise<GenerateQrResponse> => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<GenerateQrPayload, GenerateQrResponse>(
    functions,
    'generateLocationQr'
  )
  const { data } = await callable(payload)
  return data
}

export const updateRuntimeSetting = (key: string, value: unknown) => {
  const ref = doc(db, 'settings', 'runtime')
  return updateDoc(ref, {
    [key]: value
  } as Record<string, unknown>)
}

export const setFreezeState = (isFrozen: boolean) => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<{ frozen: boolean }, { ok: true }>(functions, 'setFreezeState')
  return callable({ frozen: isFrozen }).then((res) => res.data)
}

export type SetUserRolePayload = {
  email?: string
  uid?: string
  role: 'leader' | 'admin' | 'none'
  teamName?: string
  teamTag?: string
  matchId?: string
  groupId?: string
}

export type SetUserRoleResponse = {
  uid: string
  email: string | null
  role: 'leader' | 'admin' | null
  teamUpdated: boolean
}

export const setUserRole = async (payload: SetUserRolePayload): Promise<SetUserRoleResponse> => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<SetUserRolePayload, SetUserRoleResponse>(functions, 'setUserRole')
  const { data } = await callable(payload)
  return data
}

export type BulkImportRow = {
  email?: string
  uid?: string
  role: 'leader' | 'admin' | 'none'
  teamName?: string
  teamTag?: string
  matchId?: string
  groupId?: string
}

export type BulkImportResult = {
  successCount: number
  failureCount: number
  errors: Array<{ index: number; code: string; message: string }>
}

export const bulkImportUsers = async (rows: BulkImportRow[]): Promise<BulkImportResult> => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<{ rows: BulkImportRow[] }, BulkImportResult>(functions, 'bulkImportUsers')
  const { data } = await callable({ rows })
  return data
}

export type SetTeamGroupPayload = {
  teamId: string
  matchId: string
  groupId: string
}

export const setTeamGroupAssignment = async (payload: SetTeamGroupPayload) => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<SetTeamGroupPayload, { ok: true }>(functions, 'setTeamGroup')
  const { data } = await callable(payload)
  return data
}

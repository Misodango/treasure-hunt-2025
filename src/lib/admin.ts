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
}

export const createLocation = (input: LocationInput) =>
  addDoc(collection(db, 'locations'), {
    ...input,
    createdAt: new Date()
  })

export const updateLocationById = (id: string, input: Partial<LocationInput>) =>
  updateDoc(doc(db, 'locations', id), {
    ...input,
    updatedAt: new Date()
  })

export const deleteLocationById = (id: string) => deleteDoc(doc(db, 'locations', id))

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

import { getApp } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'

export type ClaimPayload = {
  token: string
  providedKeyword: string
  providedTeamTag: string
}

export type ClaimResponse = {
  pointsAwarded: number
  locationId: string
  processedAt: string
}

export const submitClaim = async (payload: ClaimPayload): Promise<ClaimResponse> => {
  const app = getApp()
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION as string | undefined
  const functions = region ? getFunctions(app, region) : getFunctions(app)
  const callable = httpsCallable<ClaimPayload, ClaimResponse>(functions, 'claim')
  const { data } = await callable(payload)
  return data
}

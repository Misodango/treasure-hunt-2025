import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

export type LocationDoc = {
  id: string
  title: string
  difficulty: number
  basePoints: number
  boxKeyword: string
  isActive: boolean
  matchId: string | null
}

export const useLocations = (matchId?: string | null) => {
  const [data, setData] = useState<LocationDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    const baseRef = collection(db, 'locations')
    const constraints = matchId
      ? [where('matchId', '==', matchId), orderBy('title')]
      : [orderBy('title')]
    const ref = query(baseRef, ...constraints)
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as Omit<LocationDoc, 'id' | 'matchId'> & {
            isActive?: boolean
            matchId?: string | null
          }
          return {
            id: docSnap.id,
            ...raw,
            isActive: raw.isActive ?? true,
            matchId: typeof raw.matchId === 'string' && raw.matchId ? raw.matchId : null
          }
        })
        setData(next)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [matchId])

  return { data, loading, error }
}

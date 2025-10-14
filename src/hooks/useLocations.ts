import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

export type LocationDoc = {
  id: string
  title: string
  difficulty: number
  basePoints: number
  boxKeyword: string
  isActive: boolean
}

export const useLocations = () => {
  const [data, setData] = useState<LocationDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = query(collection(db, 'locations'), orderBy('title'))
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<LocationDoc, 'id'>)
        }))
        setData(next)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  return { data, loading, error }
}

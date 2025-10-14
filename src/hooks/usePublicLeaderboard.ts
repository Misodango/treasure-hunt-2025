import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'
import { Timestamp } from 'firebase/firestore'

export type PublicLeaderboardEntry = {
  teamName: string
  score: number
  lastSolveAt?: Timestamp
}

export type PublicLeaderboardDoc = {
  updatedAt?: Timestamp
  entries: PublicLeaderboardEntry[]
  masked?: boolean
}

export const usePublicLeaderboard = () => {
  const [data, setData] = useState<PublicLeaderboardDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = doc(db, 'leaderboard_public', 'runtime')
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const docData = snapshot.data()
        if (docData) {
          setData(docData as PublicLeaderboardDoc)
        } else {
          setData(null)
        }
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

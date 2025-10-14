import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

export type TeamSolveEntry = {
  at: unknown
  points: number
}

export type TeamDoc = {
  name: string
  leaderEmail: string
  teamTag: string
  score: number
  solved?: Record<string, TeamSolveEntry>
}

export const useTeamData = (teamId: string | null | undefined) => {
  const [data, setData] = useState<TeamDoc | null>(null)
  const [loading, setLoading] = useState(Boolean(teamId))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!teamId) {
      setLoading(false)
      setData(null)
      return
    }

    setLoading(true)
    const ref = doc(db, 'teams', teamId)
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const docData = snapshot.data()
        if (docData) {
          setData({ ...(docData as TeamDoc) })
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
  }, [teamId])

  return { data, loading, error }
}

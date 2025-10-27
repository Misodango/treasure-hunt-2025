import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'
import { Timestamp } from 'firebase/firestore'

export type LeaderboardTeamEntry = {
  teamId: string
  teamName: string
  score: number
  lastSolveAt?: Timestamp | null
  elapsedSeconds?: number | null
  solvedCount?: number
}

export type LeaderboardGroup = {
  id: string
  matchId: string
  name: string
  order: number
  startAt?: Timestamp | null
  endAt?: Timestamp | null
  isActive?: boolean
  entries: LeaderboardTeamEntry[]
}

export type LeaderboardMatch = {
  id: string
  name: string
  order: number
  isActive?: boolean
  groups: LeaderboardGroup[]
}

export type PublicLeaderboardDoc = {
  updatedAt?: Timestamp
  masked?: boolean
  matches: LeaderboardMatch[]
  schemaVersion?: number
  unassignedNotice?: boolean
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

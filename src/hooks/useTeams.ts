import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

export type TeamListDoc = {
  id: string
  name: string
  leaderEmail: string | null
  teamTag: string
  score: number
  matchId: string | null
  matchName: string | null
  groupId: string | null
  groupName: string | null
}

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

const normalizeNumber = (value: unknown): number => {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return 0
  return num
}

export const useTeams = () => {
  const [data, setData] = useState<TeamListDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = query(collection(db, 'teams'), orderBy('name'))
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() ?? {}
          return {
            id: docSnap.id,
            name: normalizeString(raw.name) || docSnap.id,
            leaderEmail:
              typeof raw.leaderEmail === 'string' && raw.leaderEmail.trim()
                ? raw.leaderEmail.trim()
                : null,
            teamTag: normalizeString(raw.teamTag),
            score: normalizeNumber(raw.score),
            matchId: typeof raw.matchId === 'string' && raw.matchId.trim() ? raw.matchId : null,
            matchName:
              typeof raw.matchName === 'string' && raw.matchName.trim() ? raw.matchName : null,
            groupId: typeof raw.groupId === 'string' && raw.groupId.trim() ? raw.groupId : null,
            groupName:
              typeof raw.groupName === 'string' && raw.groupName.trim() ? raw.groupName : null
          } satisfies TeamListDoc
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
  }, [])

  return { data, loading, error }
}

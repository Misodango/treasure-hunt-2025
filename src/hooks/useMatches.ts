import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase/config'

export type MatchDoc = {
  id: string
  name: string
  order: number
  isActive: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

export type GroupDoc = {
  id: string
  matchId: string
  name: string
  order: number
  startAt?: unknown
  endAt?: unknown
  isActive: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

const DEFAULT_ORDER = Number.MAX_SAFE_INTEGER - 1

const ensureOrder = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return DEFAULT_ORDER
}

const resolveBoolean = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') return value
  return fallback
}

export const useMatches = () => {
  const [data, setData] = useState<MatchDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = query(collection(db, 'matches'), orderBy('order', 'asc'))
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() ?? {}
          return {
            id: docSnap.id,
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : docSnap.id,
            order: ensureOrder(raw.order),
            isActive: resolveBoolean(raw.isActive, true),
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt
          } satisfies MatchDoc
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

export const useGroups = () => {
  const [data, setData] = useState<GroupDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = query(collection(db, 'groups'), orderBy('matchId'), orderBy('order'))
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() ?? {}
          return {
            id: docSnap.id,
            matchId: typeof raw.matchId === 'string' ? raw.matchId : '',
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : docSnap.id,
            order: ensureOrder(raw.order),
            startAt: raw.startAt,
            endAt: raw.endAt,
            isActive: resolveBoolean(raw.isActive, true),
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt
          } satisfies GroupDoc
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

export type MatchWithGroups = MatchDoc & {
  groups: GroupDoc[]
}

export const useMatchHierarchy = () => {
  const matches = useMatches()
  const groups = useGroups()

  const data = useMemo<MatchWithGroups[]>(() => {
    const map = new Map<string, MatchWithGroups>()
    for (const match of matches.data) {
      map.set(match.id, { ...match, groups: [] })
    }
    for (const group of groups.data) {
      const container = map.get(group.matchId)
      if (container) {
        container.groups.push(group)
      }
    }
    return Array.from(map.values())
      .map((match) => ({
        ...match,
        groups: [...match.groups].sort((a, b) => a.order - b.order)
      }))
      .sort((a, b) => a.order - b.order)
  }, [matches.data, groups.data])

  const loading = matches.loading || groups.loading
  const error = matches.error ?? groups.error

  return { data, loading, error }
}

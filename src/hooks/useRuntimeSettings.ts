import { doc, onSnapshot, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'
import type { RuntimeSettings } from '../lib/time'

type RuntimeDoc = RuntimeSettings & {
  freezeOverride?: boolean
}

export const useRuntimeSettings = () => {
  const [data, setData] = useState<RuntimeDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ref = doc(db, 'settings', 'runtime')
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const value = snapshot.data() as DocumentData | undefined
        if (value) {
          setData(value as RuntimeDoc)
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

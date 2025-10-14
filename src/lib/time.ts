import { Timestamp } from 'firebase/firestore'

export type RuntimeSettings = {
  eventStart?: Date | Timestamp | string | number | null
  freezeAt?: Date | Timestamp | string | number | null
  eventEnd?: Date | Timestamp | string | number | null
}

export type EventPhase = 'pre' | 'running' | 'frozen' | 'finished' | 'unknown'

export type PhaseState = {
  phase: EventPhase
  countdownTarget?: Date
  isLeaderboardVisible: boolean
}

const toDate = (value?: RuntimeSettings[keyof RuntimeSettings]): Date | undefined => {
  if (!value) return undefined
  if (value instanceof Date) return value
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return undefined
}

export const computePhaseState = (
  runtime: RuntimeSettings | null | undefined,
  now: Date = new Date()
): PhaseState => {
  if (!runtime) {
    return {
      phase: 'unknown',
      isLeaderboardVisible: false
    }
  }

  const eventStart = toDate(runtime.eventStart)
  const freezeAt = toDate(runtime.freezeAt)
  const eventEnd = toDate(runtime.eventEnd)

  if (!eventStart || !eventEnd) {
    return {
      phase: 'unknown',
      isLeaderboardVisible: false
    }
  }

  if (now < eventStart) {
    return {
      phase: 'pre',
      countdownTarget: eventStart,
      isLeaderboardVisible: false
    }
  }

  if (now >= eventEnd) {
    return {
      phase: 'finished',
      isLeaderboardVisible: true
    }
  }

  if (freezeAt && now >= freezeAt) {
    return {
      phase: 'frozen',
      countdownTarget: eventEnd,
      isLeaderboardVisible: false
    }
  }

  return {
    phase: 'running',
    countdownTarget: freezeAt ?? eventEnd,
    isLeaderboardVisible: true
  }
}

export const formatDuration = (target: Date, now: Date = new Date()): string => {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return '00:00'

  const totalSeconds = Math.floor(diff / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (v: number) => v.toString().padStart(2, '0')
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

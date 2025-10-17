import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useZxing } from 'react-zxing'
import { storeScannedToken } from '../lib/qr'

const INITIAL_STATUS = 'カメラを開始するには下のボタンを押してください。'

const formatTokenPreview = (token: string) => {
  if (token.length <= 32) return token
  return `${token.slice(0, 24)}…${token.slice(-8)}`
}

const isIgnorableZXingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return typeof name === 'string' && name.startsWith('NotFoundException')
}

const resolveScannerErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'ブラウザでカメラ利用が許可されませんでした。権限を確認して再度お試しください。'
      case 'NotFoundError':
        return '利用可能なカメラが見つかりませんでした。別のデバイスでお試しください。'
      case 'TrackStartError':
      case 'NotReadableError':
        return 'カメラを起動できませんでした。別のアプリで利用されていないか確認してください。'
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'カメラ設定の初期化に失敗しました。別のカメラでお試しください。'
      default:
        return (
          error.message ||
          'カメラの初期化に失敗しました。ブラウザの権限設定を確認してください。'
        )
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'カメラの初期化に失敗しました。ブラウザの権限設定を確認してください。'
}

const QrScannerPage = () => {
  const mountedRef = useRef(true)
  const lastTokenRef = useRef<string | null>(null)

  const [status, setStatus] = useState(INITIAL_STATUS)
  const [error, setError] = useState<string | null>(null)
  const [scannedToken, setScannedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [shouldScan, setShouldScan] = useState(false)

  const supportsCamera = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
    []
  )

  const stopAll = useCallback(() => {
    if (!mountedRef.current) return
    setStatus(INITIAL_STATUS)
    setIsRunning(false)
    setShouldScan(false)
  }, [])

  const handleDetectedToken = useCallback(
    async (rawValue: string) => {
      if (!rawValue || rawValue === lastTokenRef.current || !mountedRef.current) return
      lastTokenRef.current = rawValue
      setScannedToken(rawValue)
      storeScannedToken(rawValue)
      setStatus('QRコードを検出しました。')
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(rawValue)
          if (mountedRef.current) {
            setCopied(true)
          }
        } catch {
          if (mountedRef.current) {
            setCopied(false)
          }
        }
      } else if (mountedRef.current) {
        setCopied(false)
      }
    },
    []
  )

  const restartScanner = useCallback(() => {
    setShouldScan(false)
    window.setTimeout(() => {
      if (mountedRef.current) {
        setShouldScan(true)
      }
    }, 0)
  }, [])

  const startScanner = useCallback(() => {
    if (!supportsCamera) {
      setStatus('')
      setError('お使いのブラウザでカメラが利用できません。通常のQRリーダーで読み取り、トークンを手入力してください。')
      return
    }

    setError(null)
    setCopied(false)
    lastTokenRef.current = null
    setIsRunning(true)
    setStatus('カメラを初期化しています…')

    if (shouldScan) {
      restartScanner()
    } else {
      setShouldScan(true)
    }
  }, [supportsCamera, shouldScan, restartScanner])

  const { ref: videoRef } = useZxing({
    paused: !shouldScan,
    timeBetweenDecodingAttempts: 200,
    onDecodeResult: (result) => {
      const text = result.getText()
      if (text) {
        void handleDetectedToken(text)
      }
    },
    onDecodeError: (err) => {
      if (!isIgnorableZXingError(err)) {
        console.warn('ZXing scan error', err)
      }
    },
    onError: (err) => {
      console.error('Failed to start QR scanner', err)
      if (!mountedRef.current) return
      stopAll()
      setStatus('')
      setError(resolveScannerErrorMessage(err))
    },
    constraints: {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' }
      }
    }
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleReady = () => {
      if (mountedRef.current && shouldScan) {
        setStatus('QRコードを枠内にかざしてください。')
      }
    }

    video.addEventListener('loadeddata', handleReady)
    video.addEventListener('playing', handleReady)

    return () => {
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('playing', handleReady)
    }
  }, [videoRef, shouldScan])

  useEffect(() => {
    if (!supportsCamera) {
      setStatus('')
      setError('お使いのブラウザでカメラが利用できません。通常のQRリーダーで読み取り、トークンを手入力してください。')
    }
  }, [supportsCamera])

  useEffect(() => {
    return () => {
      stopAll()
      mountedRef.current = false
    }
  }, [stopAll])

  const handleDashboardRedirect = () => {
    stopAll()
    window.location.href = '/'
  }

  return (
    <div className="app-layout scanner">
      <header className="app-header">
        <div>
          <h1>QRスキャナー</h1>
          <p>明和寮 宝探しイベント</p>
        </div>
        <div className="header-meta">
          <button className="secondary small" onClick={handleDashboardRedirect}>
            ダッシュボードに戻る
          </button>
        </div>
      </header>

      <main className="app-main scanner-main">
        <section className="card scanner-card">
          <h2>カメラで読み取る</h2>
          <div className="button-row">
            <button type="button" onClick={startScanner} disabled={!supportsCamera}>
              {isRunning ? 'カメラを再起動' : 'カメラを開始'}
            </button>
          </div>
          <div className="scanner-video-wrapper">
            <video ref={videoRef} autoPlay playsInline muted className="scanner-video" />
          </div>
          {status ? <p className="status info">{status}</p> : null}
          {copied ? (
            <p className="status success">読み取ったトークンをクリップボードにコピーしました。</p>
          ) : null}
          {error ? <p className="status error">{error}</p> : null}
          {scannedToken ? (
            <div className="scanner-result">
              <p>
                <strong>検出したトークン:</strong>
              </p>
              <code className="token-preview">{formatTokenPreview(scannedToken)}</code>
              <button type="button" onClick={handleDashboardRedirect}>
                ダッシュボードで提出する
              </button>
            </div>
          ) : null}
        </section>

        <section className="card scanner-card">
          <h2>使い方</h2>
          <ol className="scanner-steps">
            <li>「カメラを開始」を押してブラウザのカメラ利用を許可します。</li>
            <li>表示された枠内に宝箱のQRコードをかざしてください。</li>
            <li>
              読み取ったトークンは自動的にコピー・保存されます。
              設定後は「ダッシュボードで提出する」からメイン画面に戻り、合言葉と一緒に提出してください。
            </li>
            <li>
              カメラが使えない場合は、お手持ちのQRリーダーで読み取ってトークンを手入力してください。
            </li>
          </ol>
        </section>
      </main>

      <footer className="app-footer">
        <small>© {new Date().getFullYear()} 明和寮 イベント委員</small>
      </footer>
    </div>
  )
}

export default QrScannerPage

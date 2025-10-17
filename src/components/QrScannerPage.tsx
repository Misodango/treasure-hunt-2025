import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { storeScannedToken } from '../lib/qr'

type BarcodeDetectorResult = { rawValue: string }
type BarcodeDetectorOptions = { formats?: string[] }

interface BarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: BarcodeDetectorOptions) => BarcodeDetector
  }
}

const formatTokenPreview = (token: string) => {
  if (token.length <= 32) return token
  return `${token.slice(0, 24)}…${token.slice(-8)}`
}

const isIgnorableZXingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return typeof name === 'string' && name.startsWith('NotFoundException')
}

const QrScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafIdRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const mountedRef = useRef(true)
  const lastTokenRef = useRef<string | null>(null)

  const [status, setStatus] = useState(
    'カメラを開始するには下のボタンを押してください。'
  )
  const [error, setError] = useState<string | null>(null)
  const [scannedToken, setScannedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const supportsCamera = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
    []
  )

  const supportsBarcodeDetector = useMemo(
    () => typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function',
    []
  )

  const clearAnimation = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = 0
    }
  }, [])

  const stopAll = useCallback(() => {
    clearAnimation()
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    detectorRef.current = null
    if (mountedRef.current) {
      setIsRunning(false)
    }
  }, [clearAnimation])

  const handleDetectedToken = useCallback(
    async (rawValue: string) => {
      if (!rawValue) return
      if (rawValue === lastTokenRef.current) return
      lastTokenRef.current = rawValue
      setScannedToken(rawValue)
      storeScannedToken(rawValue)
      setStatus('QRコードを検出しました。')
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(rawValue)
          setCopied(true)
        } catch {
          setCopied(false)
        }
      } else {
        setCopied(false)
      }
    },
    []
  )

  const startScanner = useCallback(async () => {
    if (!supportsCamera) {
      setStatus('')
      setError('お使いのブラウザでカメラが利用できません。通常のQRリーダーで読み取り、トークンを手入力してください。')
      return
    }

    const video = videoRef.current
    if (!video) {
      setError('カメラビューの初期化に失敗しました。ページを再読み込みしてください。')
      return
    }

    stopAll()
    setError(null)
    setCopied(false)
    lastTokenRef.current = null
    setIsRunning(true)
    setStatus('カメラを初期化しています…')

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      if (supportsBarcodeDetector && window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        detectorRef.current = detector
        setStatus('QRコードを枠内にかざしてください。')

        const scan = async () => {
          if (!mountedRef.current || rafIdRef.current === 0) return
          if (!video.videoWidth || !video.videoHeight) {
            rafIdRef.current = requestAnimationFrame(scan)
            return
          }
          try {
            const barcodes = await detector.detect(video)
            if (barcodes.length > 0) {
              const rawValue = barcodes[0]?.rawValue ?? ''
              if (rawValue) {
                await handleDetectedToken(rawValue)
              }
            }
          } catch (detectError) {
            console.warn('Failed to detect QR', detectError)
          }
          if (rafIdRef.current !== 0) {
            rafIdRef.current = requestAnimationFrame(scan)
          }
        }

        rafIdRef.current = requestAnimationFrame(scan)
      } else {
        const module = await import('@zxing/browser')
        const ReaderCtor = module.BrowserQRCodeReader
        if (!ReaderCtor) {
          throw new Error('Fallback QRコードリーダーの初期化に失敗しました。')
        }
        const reader = new ReaderCtor(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 1000
        })
        setStatus('QRコードを枠内にかざしてください。')
        controlsRef.current = await reader.decodeFromStream(
          stream,
          video,
          async (result, err) => {
            if (!mountedRef.current) return
            if (result) {
              const text = result.getText()
              if (text) {
                await handleDetectedToken(text)
              }
              return
            }
            if (err && !isIgnorableZXingError(err)) {
              console.warn('ZXing scan error', err)
            }
          }
        )
      }
    } catch (err) {
      console.error(err)
      stopAll()
      setStatus('')
      const message =
        err instanceof Error
          ? err.message
          : 'カメラの初期化に失敗しました。ブラウザの権限設定を確認してください。'
      setError(message)
    }
  }, [supportsCamera, supportsBarcodeDetector, stopAll, handleDetectedToken])

  useEffect(() => {
    if (!supportsCamera) {
      setStatus('')
      setError('お使いのブラウザでカメラが利用できません。通常のQRリーダーで読み取り、トークンを手入力してください。')
    }
  }, [supportsCamera])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      stopAll()
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
            <video ref={videoRef} playsInline muted className="scanner-video" />
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

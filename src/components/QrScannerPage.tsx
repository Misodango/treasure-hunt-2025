import { useEffect, useMemo, useRef, useState } from 'react'
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

const QrScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('カメラを初期化しています…')
  const [scannedToken, setScannedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const lastTokenRef = useRef<string | null>(null)

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

  useEffect(() => {
    if (!supportsCamera) {
      setStatus('')
      setError('お使いのブラウザでカメラが利用できません。通常のQRリーダーで読み取り、トークンを手入力してください。')
      return
    }

    let isMounted = true
    let stream: MediaStream | null = null
    let rafId = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let detector: BarcodeDetector | null = null

    const startScanner = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment'
          }
        })
        if (!isMounted) return

        const video = videoRef.current
        if (!video) throw new Error('Video element unavailable')
        video.srcObject = stream
        await video.play()

        if (!ctx) {
          throw new Error('Canvas context 初期化に失敗しました。')
        }

        if (supportsBarcodeDetector) {
          const DetectorCtor = window.BarcodeDetector
          if (!DetectorCtor) {
            throw new Error('BarcodeDetector API is not available in this browser.')
          }
          detector = new DetectorCtor({ formats: ['qr_code'] })
        } else {
          throw new Error(
            'このブラウザは QR コードの自動検出に対応していません。別のブラウザをご利用ください。'
          )
        }

        setStatus('QRコードを枠内にかざしてください。')

        const scan = async () => {
          if (!isMounted || !detector) return
          const currentVideo = videoRef.current
          if (
            currentVideo &&
            currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            currentVideo.videoWidth > 0 &&
            currentVideo.videoHeight > 0
          ) {
            canvas.width = currentVideo.videoWidth
            canvas.height = currentVideo.videoHeight
            ctx.drawImage(currentVideo, 0, 0, canvas.width, canvas.height)
            try {
              const barcodes = await detector.detect(canvas)
              if (barcodes.length > 0) {
                const rawValue = barcodes[0]?.rawValue ?? ''
                if (rawValue && rawValue !== lastTokenRef.current) {
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
                  return
                }
              }
            } catch (detectError) {
              console.warn('Failed to detect QR', detectError)
            }
          }
          if (!lastTokenRef.current) {
            rafId = requestAnimationFrame(scan)
          }
        }

        rafId = requestAnimationFrame(scan)
      } catch (err) {
        console.error(err)
        if (!isMounted) return
        setStatus('')
        setError(
          err instanceof Error ? err.message : 'カメラの初期化に失敗しました。権限を確認してください。'
        )
      }
    }

    void startScanner()

    return () => {
      isMounted = false
      if (rafId) cancelAnimationFrame(rafId)
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [supportsCamera, supportsBarcodeDetector])

  const handleDashboardRedirect = () => {
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
            <li>チームデバイスでこのページを開き「カメラの利用」を許可する。</li>
            <li>表示された枠内に宝箱のQRコードをかざす。</li>
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

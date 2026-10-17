import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'

type Style = 'ivory' | 'sand' | 'midnight'
type ImageFile = { file: File; url: string }

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ImageFile | null>(null)
  const [style, setStyle] = useState<Style>('ivory')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [outputUrl, setOutputUrl] = useState('')

  useEffect(() => () => {
    if (source?.url) URL.revokeObjectURL(source.url)
    if (outputUrl) URL.revokeObjectURL(outputUrl)
  }, [source?.url, outputUrl])

  function acceptFile(file?: File) {
    setError('')
    setStatus('idle')
    setOutputUrl('')
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be 10 MB or smaller.')
      return
    }
    setSource({ file, url: URL.createObjectURL(file) })
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    acceptFile(event.dataTransfer.files?.[0])
  }

  async function generatePreview() {
    if (!source) return
    setError('')
    setStatus('working')
    try {
      const result = await makeDemoCatalog(source.url, style)
      setOutputUrl(URL.createObjectURL(result))
      setStatus('done')
    } catch {
      setError('Could not prepare the preview. Try another image.')
      setStatus('error')
    }
  }

  function downloadOutput() {
    if (!outputUrl) return
    const link = document.createElement('a')
    link.href = outputUrl
    link.download = 'jewel-studio-demo-catalog.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Jewel Studio home">
          <span className="brand-mark">J</span>
          <span>jewel<span className="brand-light">studio</span></span>
        </a>
        <span className="prototype-pill"><span className="status-dot" /> Prototype</span>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">PRODUCT PHOTOGRAPHY, REIMAGINED</p>
        <h1>Make every piece<br /><em>look exceptional.</em></h1>
        <p className="hero-copy">Turn a basic jewelry photo into a polished catalog visual. Upload a product photo to try the prototype.</p>
      </section>

      <section className="workspace" aria-label="Catalog generator">
        <div className="panel upload-panel">
          <div className="panel-heading">
            <div><span className="step">01</span><h2>Product photo</h2></div>
            <span className="subtle-label">Required</span>
          </div>

          <div className={`dropzone ${source ? 'has-image' : ''}`} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            {source ? (
              <>
                <img className="source-preview" src={source.url} alt="Uploaded jewelry product" />
                <div className="file-details"><strong>{source.file.name}</strong><span>{(source.file.size / 1024 / 1024).toFixed(2)} MB</span></div>
                <button className="text-button" onClick={() => inputRef.current?.click()}>Replace image</button>
              </>
            ) : (
              <>
                <div className="upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3" /></svg></div>
                <strong>Drop your product photo here</strong>
                <span>or choose a file from your device</span>
                <button className="secondary-button" onClick={() => inputRef.current?.click()}>Choose photo</button>
                <small>JPG, PNG, WebP · Up to 10 MB</small>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} hidden />
          </div>

          <div className="field-block">
            <div className="field-label-row"><label>Catalog background</label><span className="subtle-label">Choose a look</span></div>
            <div className="style-options">
              <button className={`style-option ${style === 'ivory' ? 'selected' : ''}`} onClick={() => setStyle('ivory')} aria-pressed={style === 'ivory'}><span className="swatch ivory-swatch" /><span>Soft ivory</span></button>
              <button className={`style-option ${style === 'sand' ? 'selected' : ''}`} onClick={() => setStyle('sand')} aria-pressed={style === 'sand'}><span className="swatch sand-swatch" /><span>Warm sand</span></button>
              <button className={`style-option ${style === 'midnight' ? 'selected' : ''}`} onClick={() => setStyle('midnight')} aria-pressed={style === 'midnight'}><span className="swatch midnight-swatch" /><span>Midnight</span></button>
            </div>
          </div>

          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button" disabled={!source || status === 'working'} onClick={generatePreview}>
            {status === 'working' ? <><span className="spinner" /> Preparing preview…</> : <><span>✦</span> Generate catalog preview</>}
          </button>
          <p className="prototype-note">Demo only: this creates a styled preview in your browser. AI generation and account login are not connected yet.</p>
        </div>

        <div className="panel result-panel">
          <div className="panel-heading">
            <div><span className="step">02</span><h2>Catalog preview</h2></div>
            {status === 'done' && <span className="ready-pill">Preview ready</span>}
          </div>
          <div className={`preview-stage ${style}`}>
            {outputUrl ? (
              <img className="output-preview" src={outputUrl} alt="Generated demo catalog composition" />
            ) : (
              <div className="empty-preview">
                <div className="empty-art"><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="art-gem">◇</span><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span></div>
                <strong>Your catalog image will appear here</strong>
                <span>Upload a product photo to get started</span>
              </div>
            )}
          </div>
          <div className="result-footer">
            <div><strong>{outputUrl ? 'Demo catalog composition' : 'Waiting for an image'}</strong><span>{outputUrl ? 'PNG · generated locally' : 'Your result will be shown here'}</span></div>
            <button className="download-button" disabled={!outputUrl} onClick={downloadOutput}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg> Download</button>
          </div>
        </div>
      </section>

      <footer className="footer"><span>JEWEL STUDIO · EARLY PROTOTYPE</span><span>Built for catalog and marketing teams</span></footer>
    </main>
  )
}

async function makeDemoCatalog(imageUrl: string, style: Style): Promise<Blob> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1500
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const palettes: Record<Style, { top: string; bottom: string; ink: string; muted: string; accent: string }> = {
    ivory: { top: '#fbf8f2', bottom: '#eee5d7', ink: '#3e352d', muted: '#8d7e6d', accent: '#c2a574' },
    sand: { top: '#f4e7d6', bottom: '#d9c1a4', ink: '#49372b', muted: '#8a6d54', accent: '#a97945' },
    midnight: { top: '#20242b', bottom: '#101318', ink: '#f6efe5', muted: '#c2b6a5', accent: '#d5b778' },
  }
  const p = palettes[style]
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, p.top)
  gradient.addColorStop(1, p.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = p.accent + '99'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(72, 110); ctx.lineTo(1128, 110); ctx.stroke()
  ctx.fillStyle = p.ink
  ctx.font = '500 24px Georgia, serif'
  ctx.textAlign = 'left'
  ctx.fillText('ATELIER  /  FINE JEWELRY', 76, 82)
  ctx.textAlign = 'right'
  ctx.fillStyle = p.muted
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText('COLLECTION 01', 1124, 82)

  const maxW = 850, maxH = 990
  const scale = Math.min(maxW / image.width, maxH / image.height)
  const w = image.width * scale, h = image.height * scale
  const x = (canvas.width - w) / 2
  const y = 190 + (maxH - h) / 2
  ctx.save()
  ctx.shadowColor = '#00000018'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 12
  ctx.drawImage(image, x, y, w, h)
  ctx.restore()

  ctx.strokeStyle = p.accent + '99'
  ctx.beginPath(); ctx.moveTo(72, 1270); ctx.lineTo(1128, 1270); ctx.stroke()
  ctx.textAlign = 'left'
  ctx.fillStyle = p.ink
  ctx.font = 'italic 42px Georgia, serif'
  ctx.fillText('Designed to be treasured.', 76, 1335)
  ctx.fillStyle = p.muted
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText('PRODUCT PHOTOGRAPHY  ·  TIMELESS DETAILS', 78, 1380)
  ctx.textAlign = 'right'
  ctx.fillStyle = p.accent
  ctx.font = '22px Georgia, serif'
  ctx.fillText('JS / 01', 1124, 1380)

  return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Export failed')), 'image/png'))
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = url
  })
}

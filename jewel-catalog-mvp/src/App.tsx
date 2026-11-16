import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

type ModelType = 'Product only' | 'Female' | 'Male'
type Preferences = {
  model_type: ModelType
  background: string
  age_range: string
  skin_tone: string
  outfit: string
}
type JobStatus = 'received' | 'queued' | 'processing' | 'completed' | 'failed' | 'mock_completed'
type SavedJob = {
  id: string
  filename: string
  createdAt: number
  status: JobStatus
  preferences: Preferences
}
type ImageFile = { file: File; url: string }

const API_URL = 'http://127.0.0.1:8000'
const HISTORY_KEY = 'jewel-studio-jobs-v1'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BACKGROUNDS = [
  { key: 'ivory', label: 'Soft ivory' },
  { key: 'sand', label: 'Warm sand' },
  { key: 'midnight', label: 'Midnight' },
]
const STATUS_LABELS: Record<JobStatus, string> = {
  received: 'Queued', queued: 'Queued', processing: 'Generating',
  completed: 'Ready', failed: 'Generation failed', mock_completed: 'Preview mode complete',
}
const DEFAULT_PREFERENCES: Preferences = {
  model_type: 'Product only', background: 'Soft ivory', age_range: 'Young adult',
  skin_tone: 'Choose for me', outfit: 'Traditional',
}

function readHistory(): SavedJob[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((job): job is SavedJob => {
      if (!job || typeof job !== 'object') return false
      const item = job as Partial<SavedJob>
      return typeof item.id === 'string' && /^[\da-f-]{36}$/i.test(item.id)
        && typeof item.filename === 'string' && typeof item.createdAt === 'number'
        && Number.isFinite(item.createdAt)
        && typeof item.status === 'string' && Object.hasOwn(STATUS_LABELS, item.status)
        && !!item.preferences && ['Product only', 'Female', 'Male'].includes(item.preferences.model_type)
        && ['background', 'age_range', 'skin_tone', 'outfit'].every(
          key => typeof (item.preferences as unknown as Record<string, unknown>)[key] === 'string',
        )
    }).slice(0, 12)
  } catch {
    return []
  }
}

function isPending(status: JobStatus) {
  return status === 'received' || status === 'queued' || status === 'processing'
}

function StudioIcon({ name, className = '' }: { name: 'spark' | 'upload' | 'gem' | 'person' | 'arrow' | 'check' | 'image'; className?: string }) {
  const paths = {
    spark: 'M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
    gem: 'M3 8l4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18',
    person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21v-2a7 7 0 0 1 14 0v2',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
    image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 13 6-6 5 5 3-3 4 4M16 7h.01',
  }
  return <svg className={`studio-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function PreferenceSummary({ preferences }: { preferences: Preferences }) {
  return (
    <dl className="preference-summary">
      <div><dt>Presentation</dt><dd>{preferences.model_type === 'Product only' ? 'Product only' : `${preferences.model_type} model`}</dd></div>
      <div><dt>Background</dt><dd>{preferences.background}</dd></div>
      {preferences.model_type !== 'Product only' && <>
        <div><dt>Age range</dt><dd>{preferences.age_range}</dd></div>
        <div><dt>Skin tone</dt><dd>{preferences.skin_tone}</dd></div>
        <div><dt>Outfit</dt><dd>{preferences.outfit}</dd></div>
      </>}
    </dl>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (value: string) => void
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
  )
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const reviewRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const uploadController = useRef<AbortController | null>(null)
  const [source, setSource] = useState<ImageFile | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [history, setHistory] = useState<SavedJob[]>(readHistory)
  const [selectedId, setSelectedId] = useState(() => readHistory()[0]?.id || '')
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [recheck, setRecheck] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const selectedJob = history.find(job => job.id === selectedId)
  const hasModel = preferences.model_type !== 'Product only'
  const previewStyle = BACKGROUNDS.find(item => item.label === selectedJob?.preferences.background)?.key || 'ivory'

  useEffect(() => () => { if (source?.url) URL.revokeObjectURL(source.url) }, [source?.url])
  useEffect(() => () => uploadController.current?.abort(), [])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
      setStorageError('')
    } catch {
      setStorageError('Browser storage is unavailable. Keep this page open to track your request.')
    }
  }, [history])

  useEffect(() => {
    if (reviewing) reviewRef.current?.focus()
  }, [reviewing])

  useEffect(() => {
    setTrackingError('')
    setMediaError('')
    if (!selectedId) return
    const controller = new AbortController()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = setTimeout(() => {
      controller.abort()
      if (!disposed) setTrackingError('This is taking longer than expected. Check again to continue tracking this request.')
    }, 180_000)

    async function poll() {
      try {
        const response = await fetch(`${API_URL}/jobs/${selectedId}`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(response.status === 404
            ? 'This request is no longer available. Choose a photo to create a new one.'
            : 'We could not check your request. Check again when the connection is available.')
        }
        const job: { status: string } = await response.json()
        if (!Object.hasOwn(STATUS_LABELS, job.status)) throw new Error('The request status could not be read. Please check again.')
        if (disposed || controller.signal.aborted) return
        const status = job.status as JobStatus
        setHistory(items => items.map(item => item.id === selectedId && item.status !== status ? { ...item, status } : item))
        if (isPending(status)) timer = setTimeout(poll, 2000)
        else clearTimeout(deadline)
      } catch (err) {
        if (disposed || controller.signal.aborted) return
        clearTimeout(deadline)
        setTrackingError(err instanceof Error && err.message !== 'Failed to fetch'
          ? err.message : 'Connection lost. Your request may still be running. Check again without uploading twice.')
      }
    }
    void poll()
    return () => {
      disposed = true
      controller.abort()
      clearTimeout(timer)
      clearTimeout(deadline)
    }
  }, [selectedId, recheck])

  function updatePreference(key: keyof Preferences, value: string) {
    setPreferences(current => ({
      ...current, [key]: value,
      ...(key === 'model_type' && value === 'Product only'
        && !BACKGROUNDS.some(item => item.label === current.background)
        ? { background: 'Soft ivory' } : {}),
    }))
    setReviewing(false)
    setError('')
  }

  function acceptFile(file?: File) {
    if (!file || submittingRef.current) return
    setError('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP photo.')
      return
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setError(file.size === 0 ? 'This file is empty. Choose another photo.' : 'Choose a photo smaller than 10 MB.')
      return
    }
    setSource({ file, url: URL.createObjectURL(file) })
    setReviewing(false)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    acceptFile(event.dataTransfer.files?.[0])
  }

  function reviewRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (source && !submittingRef.current) setReviewing(true)
  }

  async function generatePreview() {
    if (!source || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    const controller = new AbortController()
    uploadController.current = controller
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const formData = new FormData()
      formData.append('image', source.file)
      const requestPreferences = hasModel ? preferences : {
        model_type: preferences.model_type, background: preferences.background,
      }
      formData.append('preferences', JSON.stringify(requestPreferences))
      const response = await fetch(`${API_URL}/jobs`, { method: 'POST', body: formData, signal: controller.signal })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail
          : response.status === 422 ? 'Check your preferences and choose a supported image.'
            : 'Your upload could not be accepted. Please try again shortly.')
      }
      const job = await response.json() as { job_id: string }
      if (!/^[\da-f-]{36}$/i.test(job.job_id)) throw new Error('The upload response was incomplete. Please check your connection.')
      const saved: SavedJob = {
        id: job.job_id, filename: source.file.name, createdAt: Date.now(),
        status: 'received', preferences: { ...preferences },
      }
      setHistory(items => [saved, ...items].slice(0, 12))
      setSelectedId(saved.id)
      setReviewing(false)
      resultRef.current?.focus()
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (err) {
      setError(controller.signal.aborted
        ? 'The upload could not be confirmed. Check your connection before submitting again.'
        : err instanceof Error && err.message !== 'Failed to fetch'
          ? err.message : 'Cannot connect to the service. Check your connection and try again.')
    } finally {
      clearTimeout(timeout)
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function downloadOutput() {
    if (!selectedJob || selectedJob.status !== 'completed' || downloading) return
    setDownloading(true)
    setMediaError('')
    try {
      const response = await fetch(`${API_URL}/jobs/${selectedJob.id}/result`)
      if (!response.ok) throw new Error('The image could not be downloaded. Please try again.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'jewel-studio-catalog.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setMediaError('The image could not be downloaded. Check your connection and try again.')
    } finally {
      setDownloading(false)
    }
  }

  const statusMessage = !selectedJob ? 'Your catalog image will appear here'
    : selectedJob.status === 'mock_completed' ? 'Preview mode complete'
      : selectedJob.status === 'failed' ? 'We could not create this image'
        : selectedJob.status === 'processing' ? 'Creating your catalog image'
          : 'Your request is queued'

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Jewel Studio home">
          <span className="brand-mark"><StudioIcon name="gem" /></span><span>jewel<span className="brand-light">studio</span><small>THE CATALOG ATELIER</small></span>
        </a>
        <nav className="topbar-nav" aria-label="Main navigation"><a href="#studio">The studio</a><a href="#how-it-works">How it works</a>{history.length > 0 && <a href="#requests">Your collection</a>}</nav>
        <span className="prototype-pill"><span className="status-dot" /> Early access</span>
      </header>
      <section className="hero" id="top">
        <div className="hero-content">
          <p className="eyebrow"><span /> A NEW PERSPECTIVE ON PRODUCT PHOTOGRAPHY</p>
          <h1>Extraordinary pieces. <br /><em>Beautifully</em><br />presented.</h1>
          <p className="hero-copy">From a simple photo to a considered catalog image. Give your jewelry the light, setting, and attention it deserves.</p>
          <div className="hero-actions"><a className="hero-cta" href="#studio">Step into the studio <StudioIcon name="arrow" /></a><a className="hero-link" href="#how-it-works">See how it works <span aria-hidden="true">&#8599;</span></a></div>
          <div className="hero-footnote"><span className="mini-gem"><StudioIcon name="gem" /></span><p>Made for your craft.<br /><strong>Designed around every detail.</strong></p></div>
        </div>
        <div className="hero-art">
          <div className="editorial-frame">
            <img src="/images/studio-editorial.png" alt="Editorial still life of gold earrings on a sculptural pedestal" fetchPriority="high" />
            <div className="editorial-topline"><span>THE STUDIO EDIT</span><StudioIcon name="spark" /></div>
            <div className="editorial-caption"><span>A STUDY IN LIGHT & FORM</span><p>Small details.<br /><em>Lasting impressions.</em></p></div>
            <span className="concept-label">Editorial concept</span>
          </div>
          <span className="editorial-side-note">JEWEL STUDIO / A DIFFERENT KIND OF FINISH</span>
          <div className="detail-note"><StudioIcon name="spark" /><div><strong>Your piece. A new perspective.</strong><span>Thoughtful settings, beautiful light.</span></div></div>
        </div>
      </section>
      <section className="studio-guide" id="how-it-works" aria-label="How it works">
        <div className="guide-intro"><span className="eyebrow">FROM PHOTO TO FINISH</span><h2>A little direction.<br /><em>A beautiful difference.</em></h2></div>
        <div className="guide-item"><span className="guide-number">01</span><div><h3>Start with your piece</h3><p>One clear photo is all you need to begin.</p></div></div>
        <div className="guide-item"><span className="guide-number">02</span><div><h3>Make it your own</h3><p>Choose the setting, styling, and mood.</p></div></div>
        <div className="guide-item"><span className="guide-number">03</span><div><h3>Meet your new image</h3><p>Compare the details. Download your favorite.</p></div></div>
      </section>
      <section className="workspace-intro" id="studio" aria-labelledby="studio-heading"><div><p className="eyebrow">YOUR CREATIVE SPACE</p><h2 id="studio-heading">A fresh setting for <em>your story.</em></h2></div><p>You bring the jewelry.<br />We help set the scene.</p></section>
      <ol className="flow-steps" aria-label="Your progress"><li className={source ? 'complete' : 'current'} aria-current={!source ? 'step' : undefined}><span>{source ? <StudioIcon name="check" /> : '01'}</span>Upload your photo</li><li className={source && !reviewing ? 'current' : ''} aria-current={source && !reviewing ? 'step' : undefined}><span>02</span>Set the direction</li><li className={reviewing ? 'current' : ''} aria-current={reviewing ? 'step' : undefined}><span>03</span>Review & create</li></ol>
      <section className="workspace" aria-label="Catalog generator">
        <form className="panel upload-panel" onSubmit={reviewRequest}>
          <div className="panel-heading"><div><span className="step">01</span><h2>Photo & direction</h2></div><span className="subtle-label">THE BRIEF</span></div>
          <fieldset className="form-fields" disabled={submitting}>
            <legend className="sr-only">Photo and catalog preferences</legend>
            <div className={`dropzone ${source ? 'has-image' : ''}`} onDragOver={event => event.preventDefault()} onDrop={onDrop}>
              {source ? <>
                <img className="source-preview" src={source.url} alt="Selected jewelry photo" />
                <div className="file-details"><strong>{source.file.name}</strong><span>{(source.file.size / 1024 / 1024).toFixed(2)} MB</span></div>
                <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>Replace photo</button>
              </> : <>
<span className="upload-symbol"><StudioIcon name="upload" /><span className="upload-spark"><StudioIcon name="spark" /></span></span>
                <strong>Drop your jewelry photo here</strong><span>A clear photo. A beautiful starting point.</span>
                <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>Choose your photo <span aria-hidden="true">+</span></button>
              </>}
              <small>JPG, PNG, WebP · Up to 10 MB</small>
              <input ref={inputRef} type="file" aria-label="Upload jewelry photo" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} hidden />
            </div>
            <fieldset className="field-block choice-fieldset">
              <legend>How should we show your jewelry?</legend>
              <div className="style-options mode-options">
                {(['Product only', 'Female', 'Male'] as ModelType[]).map(mode => (
                  <label key={mode} className={`mode-option ${preferences.model_type === mode ? 'selected' : ''}`}>
                    <input type="radio" name="model_type" value={mode} checked={preferences.model_type === mode} onChange={() => updatePreference('model_type', mode)} />
                    <StudioIcon name={mode === 'Product only' ? 'gem' : 'person'} />
                    <span className="mode-title">{mode === 'Product only' ? mode : `${mode} model`}</span>
                    <small>{mode === 'Product only' ? 'The piece, in focus' : mode === 'Female' ? 'A feminine perspective' : 'A masculine perspective'}</small>
                    <span className="selection-mark"><StudioIcon name="check" /></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {hasModel && <div className="guided-fields">
              <SelectField label="Model age" value={preferences.age_range} options={['Young adult', 'Mature adult']} onChange={value => updatePreference('age_range', value)} />
              <SelectField label="Skin tone" value={preferences.skin_tone} options={['Choose for me', 'Fair', 'Light-medium', 'Medium', 'Deep']} onChange={value => updatePreference('skin_tone', value)} />
              <SelectField label="Outfit style" value={preferences.outfit} options={['Traditional', 'Contemporary', 'Formal']} onChange={value => updatePreference('outfit', value)} />
            </div>}
            <fieldset className="field-block choice-fieldset">
              <legend>Choose a background</legend>
              <div className="style-options">
                {BACKGROUNDS.map(item => <button type="button" key={item.key} className={`style-option ${preferences.background === item.label ? 'selected' : ''}`} aria-pressed={preferences.background === item.label} onClick={() => updatePreference('background', item.label)}>
                  <span className={`swatch ${item.key}-swatch`} /><span className="swatch-label">{item.label}<span className="swatch-check"><StudioIcon name="check" /></span></span>
                </button>)}
              </div>
              {hasModel && <div className="scene-options" aria-label="Scene backgrounds">
                {['Luxury studio', 'Wedding', 'Festive', 'Minimal', 'Choose for me'].map(background => <button type="button" key={background} className="scene-option" aria-pressed={preferences.background === background} onClick={() => updatePreference('background', background)}>{background}</button>)}
              </div>}
              {!hasModel && !BACKGROUNDS.some(item => item.label === preferences.background) && <p className="field-help">Selected background: {preferences.background}. Choose a swatch above to change it.</p>}
            </fieldset>
          </fieldset>
          {error && <p className="error-message" role="alert">{error}</p>}
          {reviewing ? <div className="review-card" ref={reviewRef} tabIndex={-1}>
            <h3>Review your image request</h3>
            <p className="review-filename">{source?.file.name}</p>
            <PreferenceSummary preferences={preferences} />
            <p className="field-help">Check these choices before starting generation.</p>
            <button type="button" className="primary-button" disabled={submitting} onClick={generatePreview}>{submitting ? 'Uploading photo…' : 'Confirm & generate'}</button>
            <button type="button" className="text-button edit-button" disabled={submitting} onClick={() => setReviewing(false)}>Back to editing</button>
          </div> : <button type="submit" className="primary-button" disabled={!source || submitting}>Review image request <span aria-hidden="true">→</span></button>}
          <p className="prototype-note">One photo, one catalog image. Check jewelry details before publishing your result.</p>
        </form>
        <div className="panel result-panel" ref={resultRef} tabIndex={-1}>
          <div className="panel-heading"><div><span className="step">02</span><h2>The preview</h2></div><span className="preview-badge"><span /> LIVE CANVAS</span></div>
          <div className="job-progress" role="status" aria-live="polite">
            {selectedJob && isPending(selectedJob.status) && !trackingError && <span className="spinner" />}
            <strong>{selectedJob ? STATUS_LABELS[selectedJob.status] : 'A new perspective awaits'}</strong>
            {selectedJob && <span>{new Date(selectedJob.createdAt).toLocaleString()}</span>}
          </div>
          {trackingError && <div className="tracking-notice" role="alert"><p>{trackingError}</p><button type="button" className="secondary-button" onClick={() => setRecheck(value => value + 1)}>Check status again</button></div>}
          <div className="comparison-grid">
            <figure className="comparison-item">
              <figcaption>Original photo</figcaption>
              <div className="comparison-stage original-stage">
                {selectedJob ? <img key={`${selectedJob.id}-source-${recheck}`} src={`${API_URL}/jobs/${selectedJob.id}/source`} alt="Original jewelry for this request" onError={() => setMediaError('The original photo is unavailable. Check your connection or upload the photo again.')} />
                  : source ? <img src={source.url} alt="Selected original jewelry" /> : <span className="original-placeholder"><StudioIcon name="image" /><strong>The starting point</strong><small>Your photo belongs here.</small></span>}
              </div>
            </figure>
            <figure className="comparison-item">
              <figcaption>Catalog result</figcaption>
              <div className={`comparison-stage preview-stage ${previewStyle}`}>
                {selectedJob?.status === 'completed'
                  ? <img key={`${selectedJob.id}-result-${recheck}`} src={`${API_URL}/jobs/${selectedJob.id}/result`} alt="Generated jewelry catalog result" onError={() => setMediaError('The generated image could not be loaded. Check your connection and check status again.')} />
                  : <div className="empty-preview"><span className="preview-gem"><StudioIcon name="spark" /></span><strong>{statusMessage}</strong><span>
                    {selectedJob?.status === 'mock_completed' ? 'Your photo and choices were processed. Image generation is not enabled in this preview.'
                      : selectedJob?.status === 'failed' ? 'Choose your photo again, review your preferences, and submit a new request.'
                        : selectedJob && isPending(selectedJob.status) ? 'You can refresh this page and return to your request.'
                          : 'Upload a photo and review your choices to begin.'}
                  </span></div>}
              </div>
            </figure>
          </div>
          {mediaError && <p role="alert" className="error-message">{mediaError} <button type="button" className="text-button" onClick={() => setRecheck(value => value + 1)}>Reload images</button></p>}
          {selectedJob && <div className="request-details"><h3>Request details</h3><PreferenceSummary preferences={selectedJob.preferences} /><details><summary>Tracking reference</summary><code>{selectedJob.id}</code></details></div>}
          <div className="result-footer"><div><strong>{selectedJob?.status === 'completed' ? 'Compare the details before use' : 'Your jewelry stays the focus'}</strong><span>{selectedJob?.status === 'completed' ? 'Check stones, settings, shape, and metal color.' : 'Your result will appear above when ready.'}</span></div><button type="button" className="download-button" disabled={selectedJob?.status !== 'completed' || downloading} onClick={downloadOutput}>{downloading ? 'Downloading…' : 'Download PNG'}</button></div>
        </div>
      </section>
      {history.length > 0 && <section className="panel history-panel" id="requests" aria-labelledby="history-heading">
        <div className="panel-heading"><div><span className="step">03</span><h2 id="history-heading">Your recent creations</h2></div><span className="subtle-label">This browser</span></div>
        <p className="field-help">Your last 12 requests are saved in this browser. Select one to check its status or view its image.</p>
        <div className="history-list">{history.map(job => <button type="button" className={`history-item ${selectedId === job.id ? 'selected' : ''}`} key={job.id} aria-pressed={selectedId === job.id} disabled={submitting} onClick={() => { setSelectedId(job.id); setRecheck(value => value + 1) }}><span><strong>{job.filename}</strong><small>{job.preferences.model_type} · {job.preferences.background} · {new Date(job.createdAt).toLocaleDateString()}</small></span><span className="history-status">{STATUS_LABELS[job.status]}</span></button>)}</div>
      </section>}
      {storageError && <p className="error-message" role="alert">{storageError}</p>}
<footer className="footer"><a className="brand footer-brand" href="#top"><StudioIcon name="gem" /><span>jewel<span className="brand-light">studio</span></span></a><span>A little light. A new perspective.</span><span>MADE FOR THE DETAILS.</span></footer>
    </main>
  )
}

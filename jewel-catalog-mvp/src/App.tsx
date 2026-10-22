
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

type Style = 'ivory' | 'sand' | 'midnight'
type ImageFile = { file: File; url: string }

const API_URL = 'http://127.0.0.1:8000'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ImageFile | null>(null)
  const [style, setStyle] = useState<Style>('ivory')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [jobId, setJobId] = useState('')

  useEffect(() => {
    return () => {
      if (source?.url) URL.revokeObjectURL(source.url)
    }
  }, [source?.url])

  function acceptFile(file?: File) {
    setError('')
    setStatus('idle')
    setOutputUrl('')
    setJobId('')

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
    setOutputUrl('')
    setJobId('')
    setStatus('working')

    try {
      // Send the image and selected background style to FastAPI.
      const formData = new FormData()
      formData.append('image', source.file)
      formData.append('style', style)

      const response = await fetch(`${API_URL}/jobs`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Upload failed (${response.status}): ${detail}`)
      }

      const job = await response.json()
      const id = job.job_id as string
      setJobId(id)

      // Check the job status every two seconds, for up to three minutes.
      const deadline = Date.now() + 180_000

      while (Date.now() < deadline) {
        const statusResponse = await fetch(
          `${API_URL}/jobs/${id}`
        )

        if (!statusResponse.ok) {
          throw new Error('Could not retrieve job status.')
        }

        const currentJob = await statusResponse.json()

        if (currentJob.status === 'completed') {
          setOutputUrl(`${API_URL}/jobs/${id}/result`)
          setStatus('done')
          return
        }

        if (currentJob.status === 'failed') {
          throw new Error(
            'Image generation failed. Check the backend terminal.'
          )
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      throw new Error(
        `Generation is taking longer than expected. Job ID: ${id}`
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not generate the catalog image.'
      )
      setStatus('error')
    }
  }

  function downloadOutput() {
    if (!outputUrl) return

    const link = document.createElement('a')
    link.href = outputUrl
    link.download = 'jewel-studio-catalog.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Jewel Studio home">
          <span className="brand-mark">J</span>
          <span>
            jewel<span className="brand-light">studio</span>
          </span>
        </a>
        <span className="prototype-pill">
          <span className="status-dot" /> Prototype
        </span>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">PRODUCT PHOTOGRAPHY, REIMAGINED</p>
        <h1>
          Make every piece
          <br />
          <em>look exceptional.</em>
        </h1>
        <p className="hero-copy">
          Turn a basic jewelry photo into a polished catalog visual.
          Upload a product photo to get started.
        </p>
      </section>

      <section className="workspace" aria-label="Catalog generator">
        <div className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <span className="step">01</span>
              <h2>Product photo</h2>
            </div>
            <span className="subtle-label">Required</span>
          </div>

          <div
            className={`dropzone ${source ? 'has-image' : ''}`}
            onDragOver={event => event.preventDefault()}
            onDrop={onDrop}
          >
            {source ? (
              <>
                <img
                  className="source-preview"
                  src={source.url}
                  alt="Uploaded jewelry product"
                />
                <div className="file-details">
                  <strong>{source.file.name}</strong>
                  <span>
                    {(source.file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => inputRef.current?.click()}
                >
                  Replace image
                </button>
              </>
            ) : (
              <>
                <div className="upload-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3" />
                  </svg>
                </div>
                <strong>Drop your product photo here</strong>
                <span>or choose a file from your device</span>
                <button
                  className="secondary-button"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose photo
                </button>
                <small>JPG, PNG, WebP · Up to 10 MB</small>
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              hidden
            />
          </div>

          <div className="field-block">
            <div className="field-label-row">
              <label>Catalog background</label>
              <span className="subtle-label">Choose a look</span>
            </div>

            <div className="style-options">
              <button
                className={`style-option ${style === 'ivory' ? 'selected' : ''}`}
                onClick={() => setStyle('ivory')}
                aria-pressed={style === 'ivory'}
                disabled={status === 'working'}
              >
                <span className="swatch ivory-swatch" />
                <span>Soft ivory</span>
              </button>

              <button
                className={`style-option ${style === 'sand' ? 'selected' : ''}`}
                onClick={() => setStyle('sand')}
                aria-pressed={style === 'sand'}
                disabled={status === 'working'}
              >
                <span className="swatch sand-swatch" />
                <span>Warm sand</span>
              </button>

              <button
                className={`style-option ${style === 'midnight' ? 'selected' : ''}`}
                onClick={() => setStyle('midnight')}
                aria-pressed={style === 'midnight'}
                disabled={status === 'working'}
              >
                <span className="swatch midnight-swatch" />
                <span>Midnight</span>
              </button>
            </div>
          </div>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button"
            disabled={!source || status === 'working'}
            onClick={generatePreview}
          >
            {status === 'working' ? (
              <>
                <span className="spinner" />
                Generating catalog image…
              </>
            ) : (
              <>
                <span>✦</span> Generate catalog image
              </>
            )}
          </button>

          <p className="prototype-note">
            Images are generated through the connected backend.
            Generation may take a few moments.
            {jobId && (
              <>
                <br />
                Job ID: {jobId}
              </>
            )}
          </p>
        </div>

        <div className="panel result-panel">
          <div className="panel-heading">
            <div>
              <span className="step">02</span>
              <h2>Catalog preview</h2>
            </div>
            {status === 'done' && (
              <span className="ready-pill">Image ready</span>
            )}
          </div>

          <div className={`preview-stage ${style}`}>
            {outputUrl ? (
              <img
                className="output-preview"
                src={outputUrl}
                alt="Generated jewelry catalog image"
              />
            ) : (
              <div className="empty-preview">
                <div className="empty-art">
                  <span className="art-orbit orbit-one" />
                  <span className="art-orbit orbit-two" />
                  <span className="art-gem">◇</span>
                  <span className="art-spark spark-one">✦</span>
                  <span className="art-spark spark-two">✧</span>
                </div>
                <strong>
                  {status === 'working'
                    ? 'Creating your catalog image…'
                    : 'Your catalog image will appear here'}
                </strong>
                <span>
                  {status === 'working'
                    ? 'This can take a little while'
                    : 'Upload a product photo to get started'}
                </span>
              </div>
            )}
          </div>

          <div className="result-footer">
            <div>
              <strong>
                {outputUrl ? 'Generated catalog image' : 'Waiting for an image'}
              </strong>
              <span>
                {outputUrl
                  ? 'PNG · generated by AI'
                  : 'Your result will be shown here'}
              </span>
            </div>
            <button
              className="download-button"
              disabled={!outputUrl}
              onClick={downloadOutput}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
              </svg>
              Download
            </button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>JEWEL STUDIO · EARLY PROTOTYPE</span>
        <span>Built for catalog and marketing teams</span>
      </footer>
    </main>
  )
}

import { useCallback, useState } from 'react'
import UploadDropzone, { type PickedImage } from '@/components/UploadDropzone'
import { detect, type DetectedBox } from '@/lib/api'

type View = { status: 'idle' } | { status: 'processing' } | { status: 'error'; message: string } | { status: 'done'; boxes: DetectedBox[] }

const App = () => {
  const [view, setView] = useState<View>({ status: 'idle' })
  const [image, setImage] = useState<PickedImage | null>(null)

  const reset = useCallback(() => {
    setImage((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setView({ status: 'idle' })
  }, [])

  const run = useCallback(async (picked: PickedImage) => {
    setImage(picked)
    setView({ status: 'processing' })
    const result = await detect({ file: picked.file, strategy: 'opencv', width: picked.width, height: picked.height })
    setView(result.ok ? { status: 'done', boxes: result.boxes } : { status: 'error', message: result.message })
  }, [])

  const checkedCount = view.status === 'done' ? view.boxes.filter((box) => box.is_checked).length : 0

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Checkbox Detection</h1>
          <p className="text-sm text-gray-500">Upload a scanned form and see every checkbox it finds, filled or empty.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {view.status === 'idle' && (
          <div className="mx-auto max-w-xl">
            <UploadDropzone onPick={run} onReject={(message) => setView({ status: 'error', message })} />
          </div>
        )}

        {view.status === 'error' && (
          <div className="mx-auto max-w-xl text-center">
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {view.message}
            </p>
            <button onClick={reset} className="mt-4 text-sm font-medium text-primary hover:underline">
              Try another image
            </button>
          </div>
        )}

        {(view.status === 'processing' || view.status === 'done') && image && (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {view.status === 'processing'
                  ? 'Detecting checkboxes...'
                  : `Found ${view.boxes.length} ${view.boxes.length === 1 ? 'checkbox' : 'checkboxes'}, ${checkedCount} checked.`}
              </span>
              {view.status === 'done' && (
                <button onClick={reset} className="font-medium text-primary hover:underline">
                  Upload another
                </button>
              )}
            </div>
            <img src={image.url} alt="Uploaded form" className="mt-3 block w-full rounded-lg border border-gray-200" />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 text-sm text-gray-500">
          {new Date().getFullYear()} - Built by{' '}
          <a
            href="https://github.com/geomus"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Nahuel Daneri
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App

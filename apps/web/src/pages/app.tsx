import { useState } from 'react'
import DetectionViewer from '@/components/DetectionViewer'
import ResultsPanel from '@/components/ResultsPanel'
import UploadDropzone, { type PickedImage } from '@/components/UploadDropzone'
import { detect, type DetectedBox, type DetectionStrategy } from '@/lib/api'

type View = { status: 'idle' } | { status: 'processing' } | { status: 'error'; message: string } | { status: 'done'; boxes: DetectedBox[] }

const App = () => {
  const [view, setView] = useState<View>({ status: 'idle' })
  const [image, setImage] = useState<PickedImage | null>(null)
  const [strategy, setStrategy] = useState<DetectionStrategy>('opencv')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const reset = () => {
    if (image) URL.revokeObjectURL(image.url)
    setImage(null)
    setStrategy('opencv')
    setActiveIndex(null)
    setView({ status: 'idle' })
  }

  const detectWith = async (picked: PickedImage, nextStrategy: DetectionStrategy) => {
    setActiveIndex(null)
    setView({ status: 'processing' })
    const result = await detect({ file: picked.file, strategy: nextStrategy, width: picked.width, height: picked.height })
    setView(result.ok ? { status: 'done', boxes: result.boxes } : { status: 'error', message: result.message })
  }

  const onPick = (picked: PickedImage) => {
    setImage(picked)
    void detectWith(picked, strategy)
  }

  const onStrategyChange = (next: DetectionStrategy) => {
    setStrategy(next)
    if (image) void detectWith(image, next)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Checkbox Detection</h1>
          <p className="text-sm text-gray-500">Upload a scanned form and see every checkbox it finds, filled or empty.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {view.status === 'idle' && (
          <div className="mx-auto max-w-xl">
            <UploadDropzone onPick={onPick} onReject={(message) => setView({ status: 'error', message })} />
          </div>
        )}

        {view.status === 'processing' && (
          <div className="mx-auto max-w-3xl text-center">
            {image && <img src={image.url} alt="Uploaded form" className="mb-3 block w-full rounded-lg border border-gray-200 opacity-60" />}
            <p className="text-sm text-gray-500">Detecting checkboxes...</p>
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

        {view.status === 'done' && image && (
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <DetectionViewer image={image} boxes={view.boxes} activeIndex={activeIndex} onHover={setActiveIndex} />
            <ResultsPanel
              boxes={view.boxes}
              strategy={strategy}
              onStrategyChange={onStrategyChange}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onReset={reset}
            />
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

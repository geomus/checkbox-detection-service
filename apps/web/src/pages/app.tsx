import { useState } from 'react';
import DetectionViewer from '@/components/DetectionViewer';
import ResultsPanel from '@/components/ResultsPanel';
import UploadDropzone, { type PickedImage } from '@/components/UploadDropzone';
import { detect, type DetectedBox, type DetectionStrategy } from '@/lib/api';
import { summarize } from '@/lib/geometry';
import { cn } from '@/lib/util';

// One entry per uploaded image, in the same order.
type ImageResult = { boxes: DetectedBox[] } | { error: string };

type View =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'error'; message: string }
  | { status: 'done'; results: ImageResult[] };

// The free, offline strategy: the initial choice, the reset target, and the
// fallback when the deployment reports textract disabled.
const DEFAULT_STRATEGY: DetectionStrategy = 'opencv';

const ErrorBanner = ({ message, className }: { message: string; className?: string }) => (
  <p
    role="alert"
    className={cn(
      'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700',
      className
    )}
  >
    {message}
  </p>
);

const App = () => {
  const [view, setView] = useState<View>({ status: 'idle' });
  const [images, setImages] = useState<PickedImage[]>([]);
  const [selected, setSelected] = useState(0);
  const [strategy, setStrategy] = useState<DetectionStrategy>(DEFAULT_STRATEGY);
  const [textractDisabled, setTextractDisabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const reset = () => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setSelected(0);
    setStrategy(DEFAULT_STRATEGY);
    setActiveIndex(null);
    setView({ status: 'idle' });
  };

  const detectBatch = (picked: PickedImage[], useStrategy: DetectionStrategy) =>
    Promise.all(
      picked.map((image) =>
        detect({
          file: image.file,
          strategy: useStrategy,
          width: image.width,
          height: image.height
        })
      )
    );

  const runDetection = async (picked: PickedImage[], nextStrategy: DetectionStrategy) => {
    setActiveIndex(null);
    setView({ status: 'processing' });

    let results = await detectBatch(picked, nextStrategy);

    // 503: the deployment has this strategy off. Grey it out and fall back to
    // opencv once - opencv is never disabled, so there is no second fallback.
    if (results.some((result) => !result.ok && result.disabled)) {
      setTextractDisabled(true);
      setStrategy(DEFAULT_STRATEGY);
      results = await detectBatch(picked, DEFAULT_STRATEGY);
    }

    // Every image failed (network down, say): show the error screen, not an empty result.
    const errors = results.flatMap((result) => (result.ok ? [] : [result.message]));
    if (errors.length === results.length) {
      setView({ status: 'error', message: errors[0] });
      return;
    }

    setView({
      status: 'done',
      results: results.map((result) =>
        result.ok ? { boxes: result.boxes } : { error: result.message }
      )
    });
  };

  const onPick = (picked: PickedImage[]) => {
    setImages(picked);
    setSelected(0);
    void runDetection(picked, strategy);
  };

  const onStrategyChange = (next: DetectionStrategy) => {
    setStrategy(next);
    if (images.length > 0) void runDetection(images, next);
  };

  const current = view.status === 'done' ? view.results[selected] : undefined;
  const currentBoxes = current && 'boxes' in current ? current.boxes : [];
  const batchTotals =
    view.status === 'done' && images.length > 1
      ? {
          images: images.length,
          ...summarize(view.results.flatMap((r) => ('boxes' in r ? r.boxes : [])))
        }
      : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Checkbox Detection</h1>
          <p className="text-sm text-gray-500">
            Upload one or more scanned forms and see every checkbox each one contains, filled or
            empty.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {view.status === 'idle' && (
          <div className="mx-auto max-w-xl">
            <UploadDropzone
              onPick={onPick}
              onReject={(message) => setView({ status: 'error', message })}
            />
          </div>
        )}

        {view.status === 'processing' && (
          <div className="mx-auto max-w-3xl text-center">
            {images[0] && (
              <img
                src={images[0].url}
                alt="Uploaded form"
                className="mb-3 block w-full rounded-lg border border-gray-200 opacity-60"
              />
            )}
            <p className="text-sm text-gray-500">
              {images.length > 1
                ? `Detecting checkboxes in ${images.length} images...`
                : 'Detecting checkboxes...'}
            </p>
          </div>
        )}

        {view.status === 'error' && (
          <div className="mx-auto max-w-xl text-center">
            <ErrorBanner message={view.message} />
            <button
              onClick={reset}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Try another image
            </button>
          </div>
        )}

        {view.status === 'done' && current && images[selected] && (
          <div className="flex flex-col gap-4">
            {images.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {images.map((image, index) => {
                  const failed = 'error' in view.results[index];
                  return (
                    <button
                      key={image.url}
                      onClick={() => {
                        setSelected(index);
                        setActiveIndex(null);
                      }}
                      title={image.file.name}
                      className={cn(
                        'relative h-16 w-16 overflow-hidden rounded border',
                        index === selected
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-gray-200'
                      )}
                    >
                      <img
                        src={image.url}
                        alt={image.file.name}
                        className="h-full w-full object-cover"
                      />
                      {failed && (
                        <span className="absolute inset-0 grid place-items-center bg-red-50/80 text-sm font-semibold text-red-700">
                          !
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              {'error' in current ? (
                <ErrorBanner message={current.error} className="self-start" />
              ) : (
                <DetectionViewer
                  image={images[selected]}
                  boxes={current.boxes}
                  activeIndex={activeIndex}
                  onHover={setActiveIndex}
                />
              )}
              <ResultsPanel
                boxes={currentBoxes}
                strategy={strategy}
                onStrategyChange={onStrategyChange}
                textractDisabled={textractDisabled}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onReset={reset}
                batchTotals={batchTotals}
              />
            </div>
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
  );
};

export default App;

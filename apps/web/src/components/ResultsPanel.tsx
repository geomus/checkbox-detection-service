import { useState } from 'react';
import type { DetectedBox, DetectionStrategy } from '@/lib/api';
import { summarize } from '@/lib/geometry';
import { cn } from '@/lib/util';

// Below this a box is worth a second look; the list can filter down to just those.
const LOW_CONFIDENCE = 0.85;

const ConfidencePill = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const tone =
    value >= LOW_CONFIDENCE
      ? 'bg-green-50 text-green-700'
      : value >= 0.6
        ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700';
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums', tone)}>
      {pct}%{value < 0.6 && ' review'}
    </span>
  );
};

type Props = {
  boxes: DetectedBox[];
  strategy: DetectionStrategy;
  onStrategyChange: (strategy: DetectionStrategy) => void;
  textractDisabled: boolean;
  activeIndex: number | null;
  onHover: (index: number | null) => void;
  onReset: () => void;
  // Totals across the whole upload, shown only when there is more than one image.
  batchTotals?: { images: number; total: number; checked: number };
};

const STAT_TONES = {
  checked: 'border-green-200 bg-green-50 text-green-700',
  empty: 'border-amber-200 bg-amber-50 text-amber-700'
} as const;

const Stat = ({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: keyof typeof STAT_TONES;
}) => (
  <div
    className={cn('rounded-md border py-2', tone ? STAT_TONES[tone] : 'border-gray-200 bg-white')}
  >
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    <div className={cn('text-xs', tone ? 'opacity-70' : 'text-gray-500')}>{label}</div>
  </div>
);

const ResultsPanel = ({
  boxes,
  strategy,
  onStrategyChange,
  textractDisabled,
  activeIndex,
  onHover,
  onReset,
  batchTotals
}: Props) => {
  const { total, checked, unchecked } = summarize(boxes);
  const [lowOnly, setLowOnly] = useState(false);

  // Keep each box's original position so #n and the overlay hover-link stay put
  // when the list is filtered.
  const rows = boxes
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => !lowOnly || (box.confidence != null && box.confidence < LOW_CONFIDENCE));

  return (
    <aside className="flex flex-col gap-5 text-sm lg:sticky lg:top-6 lg:self-start">
      {batchTotals && (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-600">
          {batchTotals.images} images - {batchTotals.total} boxes, {batchTotals.checked} checked in
          total. Stats below are for the selected image.
        </p>
      )}

      <div>
        <label htmlFor="strategy" className="block font-medium text-gray-700">
          Detection strategy
        </label>
        <select
          id="strategy"
          value={strategy}
          onChange={(event) => onStrategyChange(event.target.value as DetectionStrategy)}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
        >
          <option value="opencv">OpenCV (local, free)</option>
          <option value="textract" disabled={textractDisabled}>
            AWS Textract (managed, paid, labels){textractDisabled ? ' - unavailable' : ''}
          </option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Textract also labels each box with its form field (for example "Owner").
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={total} />
        <Stat label="Checked" value={checked} tone="checked" />
        <Stat label="Empty" value={unchecked} tone="empty" />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-700">Detections</span>
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          className={cn(
            'rounded border px-2 py-0.5 text-xs',
            lowOnly
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-gray-300 text-gray-500 hover:border-gray-400'
          )}
        >
          Low confidence only
        </button>
      </div>

      <ol className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {rows.length === 0 && (
          <li className="px-3 py-2 text-xs text-gray-400">
            Nothing below the confidence threshold.
          </li>
        )}
        {rows.map(({ box, index }) => (
          <li
            key={index}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              'flex items-center justify-between px-3 py-1.5',
              index === activeIndex && 'bg-gray-50'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular-nums text-gray-400">#{index + 1}</span>
              {box.label && <span className="truncate text-gray-600">{box.label}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn('font-medium', box.is_checked ? 'text-green-700' : 'text-amber-700')}
              >
                {box.is_checked ? 'checked' : 'empty'}
              </span>
              {box.confidence != null && <ConfidencePill value={box.confidence} />}
            </span>
          </li>
        ))}
      </ol>

      <button onClick={onReset} className="self-start font-medium text-primary hover:underline">
        Upload another
      </button>
    </aside>
  );
};

export default ResultsPanel;

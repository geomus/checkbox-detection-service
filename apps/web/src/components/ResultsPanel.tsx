import type { DetectedBox, DetectionStrategy } from '@/lib/api';
import { summarize } from '@/lib/geometry';
import { cn } from '@/lib/util';

type Props = {
  boxes: DetectedBox[];
  strategy: DetectionStrategy;
  onStrategyChange: (strategy: DetectionStrategy) => void;
  activeIndex: number | null;
  onHover: (index: number | null) => void;
  onReset: () => void;
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md border border-gray-200 bg-white py-2">
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    <div className="text-xs text-gray-500">{label}</div>
  </div>
);

const Legend = ({ swatch, label }: { swatch: string; label: string }) => (
  <span className="flex items-center gap-1.5 text-gray-600">
    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: swatch }} />
    {label}
  </span>
);

const ResultsPanel = ({
  boxes,
  strategy,
  onStrategyChange,
  activeIndex,
  onHover,
  onReset
}: Props) => {
  const { total, checked, unchecked } = summarize(boxes);

  return (
    <aside className="flex flex-col gap-5 text-sm lg:sticky lg:top-6 lg:self-start">
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
          <option value="textract">AWS Textract ($)</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={total} />
        <Stat label="Checked" value={checked} />
        <Stat label="Empty" value={unchecked} />
      </div>

      <div className="flex gap-4">
        <Legend swatch="var(--color-checked)" label="Checked" />
        <Legend swatch="var(--color-unchecked)" label="Empty" />
      </div>

      <ol className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {boxes.map((box, index) => (
          <li
            key={index}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              'flex items-center justify-between px-3 py-1.5',
              index === activeIndex && 'bg-gray-50'
            )}
          >
            <span className="tabular-nums text-gray-400">#{index + 1}</span>
            <span
              className="font-medium"
              style={{ color: box.is_checked ? 'var(--color-checked)' : 'var(--color-unchecked)' }}
            >
              {box.is_checked ? 'checked' : 'empty'}
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

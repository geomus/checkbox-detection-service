import type { PickedImage } from '@/components/UploadDropzone';
import type { DetectedBox } from '@/lib/api';
import { boxToRect } from '@/lib/geometry';

type Props = {
  image: PickedImage;
  boxes: DetectedBox[];
  activeIndex: number | null;
  onHover: (index: number | null) => void;
};

// self-start + a fixed aspect ratio keep this box the same shape as the image, so a grid row
// taller than the image can't stretch the overlay away from it.
const DetectionViewer = ({ image, boxes, activeIndex, onHover }: Props) => (
  <div className="relative self-start" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
    <img
      src={image.url}
      alt="Uploaded form"
      className="block h-full w-full rounded-lg border border-gray-200"
    />
    {/* viewBox is the image's pixel size and preserveAspectRatio is off, so the API's coords
        map straight onto the rects. non-scaling-stroke keeps the borders even under the x/y stretch. */}
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${image.width} ${image.height}`}
      preserveAspectRatio="none"
      role="presentation"
    >
      {boxes.map((box, index) => {
        const rect = boxToRect(box.bbox);
        const color = box.is_checked ? 'var(--color-checked)' : 'var(--color-unchecked)';
        const active = index === activeIndex;
        return (
          <rect
            key={index}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={color}
            fillOpacity={active ? 0.35 : 0.12}
            stroke={color}
            strokeWidth={active ? 3 : 1.5}
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
          >
            <title>
              {box.label ? `${box.label}: ` : ''}
              {box.is_checked ? 'checked' : 'empty'}
              {box.confidence != null ? ` - ${Math.round(box.confidence * 100)}%` : ''}
            </title>
          </rect>
        );
      })}
    </svg>
  </div>
);

export default DetectionViewer;

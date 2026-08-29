import { useDropzone, type FileRejection } from 'react-dropzone';
import { cn } from '@/lib/util';

// Matches the API's MAX_UPLOAD_BYTES so I never send something it will reject.
const MAX_BYTES = 4 * 1024 * 1024;
// Each image is one synchronous detect call; the whole batch has to clear API
// Gateway's 29s window, so keep the count small.
const MAX_IMAGES = 8;

export type PickedImage = { file: File; url: string; width: number; height: number };

type Props = {
  onPick: (images: PickedImage[]) => void;
  onReject: (message: string) => void;
};

// Decode the file to read its pixel size: the textract path sends it to scale ratio coords, and
// the overlay uses it as the SVG viewBox. The object URL lives on in PickedImage; the caller
// revokes it on reset.
const readImage = (file: File) =>
  new Promise<PickedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    image.src = url;
  });

const rejectionMessage = (rejections: FileRejection[]) => {
  const code = rejections[0].errors[0]?.code;
  if (code === 'file-too-large')
    return 'One of those images is over the 4 MB limit. Try smaller scans.';
  if (code === 'too-many-files') return `Up to ${MAX_IMAGES} images at a time.`;
  return 'Only JPEG or PNG images are supported.';
};

const UploadDropzone = ({ onPick, onReject }: Props) => {
  const onDrop = async (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      onReject(rejectionMessage(rejections));
      return;
    }
    try {
      onPick(await Promise.all(accepted.map(readImage)));
    } catch {
      onReject('One of those images could not be read. Try different files.');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    maxSize: MAX_BYTES,
    maxFiles: MAX_IMAGES,
    multiple: true
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-center transition-colors hover:border-gray-400',
        isDragActive && 'border-primary bg-primary/5'
      )}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium text-gray-700">
        {isDragActive ? 'Drop the images here' : 'Drag images here, or click to choose'}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        JPEG or PNG, up to 4 MB each, {MAX_IMAGES} at a time
      </p>
    </div>
  );
};

export default UploadDropzone;

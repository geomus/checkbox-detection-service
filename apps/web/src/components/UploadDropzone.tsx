import { useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { cn } from '@/lib/util'

// Matches the API's MAX_UPLOAD_BYTES so I never send something it will reject.
const MAX_BYTES = 4 * 1024 * 1024

export type PickedImage = { file: File; url: string; width: number; height: number }

type Props = {
  onPick: (image: PickedImage) => void
  onReject: (message: string) => void
}

const readImage = (file: File) =>
  new Promise<PickedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable image'))
    }
    image.src = url
  })

const UploadDropzone = ({ onPick, onReject }: Props) => {
  const onDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        const code = rejections[0].errors[0]?.code
        onReject(code === 'file-too-large' ? 'That image is over the 4 MB limit. Try a smaller scan.' : 'That file is not a JPEG or PNG image.')
        return
      }
      try {
        onPick(await readImage(accepted[0]))
      } catch {
        onReject('That image could not be read. Try a different file.')
      }
    },
    [onPick, onReject]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    maxSize: MAX_BYTES,
    multiple: false,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-center transition-colors hover:border-gray-400',
        isDragActive && 'border-primary bg-primary/5'
      )}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium text-gray-700">{isDragActive ? 'Drop the image here' : 'Drag an image here, or click to choose'}</p>
      <p className="mt-1 text-xs text-gray-400">JPEG or PNG, up to 4 MB</p>
    </div>
  )
}

export default UploadDropzone

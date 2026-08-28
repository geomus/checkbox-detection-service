import { fireEvent, render, waitFor } from '@testing-library/react';
import UploadDropzone from '@/components/UploadDropzone';

const fileOfSize = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

describe('UploadDropzone', () => {
  it('rejects a file over the 4 MB limit', async () => {
    const onReject = vi.fn();
    const { container } = render(<UploadDropzone onPick={vi.fn()} onReject={onReject} />);

    fireEvent.change(fileInput(container), {
      target: { files: [fileOfSize('huge.png', 'image/png', 5 * 1024 * 1024)] }
    });

    await waitFor(() =>
      expect(onReject).toHaveBeenCalledWith(expect.stringContaining('4 MB limit'))
    );
  });

  it('rejects a file that is not a JPEG or PNG', async () => {
    const onReject = vi.fn();
    const { container } = render(<UploadDropzone onPick={vi.fn()} onReject={onReject} />);

    fireEvent.change(fileInput(container), {
      target: { files: [fileOfSize('notes.txt', 'text/plain', 1024)] }
    });

    await waitFor(() =>
      expect(onReject).toHaveBeenCalledWith(expect.stringContaining('JPEG or PNG'))
    );
  });
});

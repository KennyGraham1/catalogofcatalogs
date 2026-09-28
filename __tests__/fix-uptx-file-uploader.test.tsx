/**
 * @jest-environment jsdom
 *
 * Regression test: '.quakeml' must be accepted by FileUploader's client-side
 * type gate (FEATURE), matching the new lib/upload-limits.ts extension set
 * and the /api/upload/init extension check. Drag-drop bypasses the native
 * <input accept=...> filter, so FileUploader enforces the extension itself
 * (ACCEPTED_EXTENSIONS) — that is the gate this test exercises.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploader } from '@/components/upload/FileUploader';

function makeFile(name: string, type = 'application/xml'): File {
  return new File(['<quakeml/>'], name, { type });
}

describe('FileUploader — .quakeml extension', () => {
  it('accepts a .quakeml file through the file picker', async () => {
    const onFilesAdded = jest.fn();
    render(<FileUploader files={[]} onFilesAdded={onFilesAdded} onFileRemoved={jest.fn()} />);

    const input = screen.getByLabelText('File input for catalogue upload') as HTMLInputElement;
    const file = makeFile('catalogue.quakeml');
    await userEvent.upload(input, file);

    expect(onFilesAdded).toHaveBeenCalledWith([file]);
  });

  it('advertises .quakeml in the native file-picker accept list', () => {
    render(<FileUploader files={[]} onFilesAdded={jest.fn()} onFileRemoved={jest.fn()} />);

    const input = screen.getByLabelText('File input for catalogue upload') as HTMLInputElement;
    expect(input.accept.split(',')).toContain('.quakeml');
  });

  it('still rejects a genuinely unsupported extension', async () => {
    const onFilesAdded = jest.fn();
    render(<FileUploader files={[]} onFilesAdded={onFilesAdded} onFileRemoved={jest.fn()} />);

    const input = screen.getByLabelText('File input for catalogue upload') as HTMLInputElement;
    await userEvent.upload(input, makeFile('notes.pdf', 'application/pdf'));

    expect(onFilesAdded).not.toHaveBeenCalled();
  });
});

describe('FileUploader — remove by position, not name', () => {
  it('removes the row that was actually clicked when two files share a name', async () => {
    // Two files picked from different folders can legitimately have the same
    // name. A name-keyed callback can only identify "the first data.csv",
    // never "the second one" — the row the user actually clicked.
    const first = makeFile('data.csv', 'text/csv');
    const second = makeFile('data.csv', 'text/csv');
    const onFileRemoved = jest.fn();
    render(
      <FileUploader files={[first, second]} onFilesAdded={jest.fn()} onFileRemoved={onFileRemoved} />,
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove data.csv' });
    expect(removeButtons).toHaveLength(2);

    await userEvent.click(removeButtons[1]);

    // Called with the clicked row's index (1), not a name-based lookup that
    // would always resolve to the first match (0).
    expect(onFileRemoved).toHaveBeenCalledTimes(1);
    expect(onFileRemoved).toHaveBeenCalledWith(1);
  });

  it('gives the remove button an accessible name distinguishing each file', () => {
    render(
      <FileUploader
        files={[makeFile('alpha.csv'), makeFile('beta.csv')]}
        onFilesAdded={jest.fn()}
        onFileRemoved={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Remove alpha.csv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove beta.csv' })).toBeInTheDocument();
  });
});

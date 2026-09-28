/**
 * @jest-environment jsdom
 *
 * Regression test: the catalogue's own version is now server-managed
 * (MAJOR.MINOR.PATCH, C3) and read-only, so the free-text field the upload
 * and edit forms use for the depositor's own release label must no longer be
 * named/labelled `version` — that collided with the server-managed field.
 * It is renamed to `source_version` ("Source dataset version"), matching the
 * field name app/api/catalogues/[id]/route.ts's PATCH schema and lib/db.ts
 * already use for this concept.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogueMetadataForm } from '@/components/upload/CatalogueMetadataForm';
import type { CatalogueMetadata } from '@/types/upload';

describe('CatalogueMetadataForm — source_version (not version)', () => {
  it('labels the field "Source dataset version", not "Version"', () => {
    render(<CatalogueMetadataForm metadata={{}} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Source dataset version')).toBeInTheDocument();
    expect(screen.queryByLabelText('Version')).not.toBeInTheDocument();
  });

  it('displays metadata.source_version, not metadata.version', () => {
    const metadata: CatalogueMetadata = { source_version: 'GeoNet 2024.1' };
    render(<CatalogueMetadataForm metadata={metadata} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Source dataset version')).toHaveValue('GeoNet 2024.1');
  });

  it('writes changes back to source_version', () => {
    const onChange = jest.fn();
    render(<CatalogueMetadataForm metadata={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Source dataset version'), {
      target: { value: 'ISC Bulletin 2023' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source_version: 'ISC Bulletin 2023' }));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ version: expect.anything() }));
  });
});

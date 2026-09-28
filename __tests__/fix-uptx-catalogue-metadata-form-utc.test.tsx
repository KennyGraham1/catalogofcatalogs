/**
 * @jest-environment jsdom
 *
 * Regression tests for gap finding gc#6: CatalogueMetadataForm's Time Period
 * fields must be labelled UTC and convert datetime-local's zone-less
 * "YYYY-MM-DDTHH:mm" wall-clock string to a full UTC ISO 8601 timestamp
 * (ending 'Z') before it reaches onChange, and convert a stored UTC ISO
 * string back to that shape for display.
 *
 * Before this fix the raw datetime-local value was stored unlabelled and
 * unconverted, so a value entered in local time was later re-read as UTC
 * elsewhere in the platform (normalizeTimestamp, the exporters) — e.g. a
 * depositor in NZDT (UTC+13) entering "2024-01-01 00:00" produced a catalogue
 * that claimed coverage 13 hours earlier than it actually started.
 *
 * The fix must not go through `new Date(value)` either: that would apply the
 * *browser's* local offset and shift a value the field now explicitly labels
 * as UTC (verifier note 2's correction on gc#6). This suite's process runs
 * with a non-UTC local offset (confirmed via `new Date().getTimezoneOffset()`
 * before writing this test), so any accidental use of `new Date(value)` here
 * would produce a value other than the one asserted below.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogueMetadataForm } from '@/components/upload/CatalogueMetadataForm';
import type { CatalogueMetadata } from '@/types/upload';

// The Time Period fields live in the "Quality & Coverage" tab, which Radix
// Tabs does not mount into the DOM until it is selected (the default tab is
// "Basic Info"), so every test switches to it before querying the fields.
// Radix activates a tab on mousedown/focus (see @radix-ui/react-tabs), which
// plain fireEvent.click does not dispatch — userEvent.click does.
async function renderForm(metadata: CatalogueMetadata = {}, onChange = jest.fn()) {
  render(<CatalogueMetadataForm metadata={metadata} onChange={onChange} />);
  await userEvent.click(screen.getByRole('tab', { name: 'Quality & Coverage' }));
  return onChange;
}

describe('CatalogueMetadataForm — Time Period UTC handling (gc#6)', () => {
  it('labels both time-period fields as UTC', async () => {
    await renderForm();
    expect(screen.getByLabelText('Time Period Start (UTC)')).toBeInTheDocument();
    expect(screen.getByLabelText('Time Period End (UTC)')).toBeInTheDocument();
  });

  it('converts a typed value to a full UTC ISO string, not the raw wall-clock string', async () => {
    const onChange = jest.fn();
    await renderForm({}, onChange);

    fireEvent.change(screen.getByLabelText('Time Period Start (UTC)'), {
      target: { value: '2024-01-01T00:00' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ time_period_start: '2024-01-01T00:00:00.000Z' }),
    );
  });

  it('converts the End field independently of Start', async () => {
    const onChange = jest.fn();
    await renderForm({ time_period_start: '2024-01-01T00:00:00.000Z' }, onChange);

    fireEvent.change(screen.getByLabelText('Time Period End (UTC)'), {
      target: { value: '2024-12-31T23:59' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        time_period_start: '2024-01-01T00:00:00.000Z',
        time_period_end: '2024-12-31T23:59:00.000Z',
      }),
    );
  });

  it('converts a stored UTC ISO string back to the datetime-local display shape', async () => {
    await renderForm({ time_period_start: '2024-01-01T00:00:00.000Z', time_period_end: '2024-12-31T23:59:00.000Z' });

    expect(screen.getByLabelText('Time Period Start (UTC)')).toHaveValue('2024-01-01T00:00');
    expect(screen.getByLabelText('Time Period End (UTC)')).toHaveValue('2024-12-31T23:59');
  });

  it('round-trips a legacy zone-less stored value (pre-fix data) without crashing', async () => {
    await renderForm({ time_period_start: '2024-06-15T08:30' });
    expect(screen.getByLabelText('Time Period Start (UTC)')).toHaveValue('2024-06-15T08:30');
  });

  it('clears the field back to an empty string rather than "undefinedZ"', async () => {
    const onChange = jest.fn();
    await renderForm({ time_period_start: '2024-01-01T00:00:00.000Z' }, onChange);

    fireEvent.change(screen.getByLabelText('Time Period Start (UTC)'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ time_period_start: '' }));
  });
});

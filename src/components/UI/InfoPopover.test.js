import { renderWithProviders, screen, fireEvent, waitFor } from '../../test-utils';
import InfoPopover from './InfoPopover';

describe('InfoPopover', () => {
  it('is a named button that keeps its text out of the page until opened', () => {
    renderWithProviders(
      <InfoPopover label="More information about Start Difficulty">Some explanation</InfoPopover>
    );

    const button = screen.getByRole('button', { name: 'More information about Start Difficulty' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('Some explanation')).not.toBeInTheDocument();
  });

  it('opens on click with the full text, and closes on Escape', async () => {
    renderWithProviders(<InfoPopover label="More information">Some explanation</InfoPopover>);
    const button = screen.getByRole('button', { name: 'More information' });

    fireEvent.click(button);
    const text = await screen.findByText('Some explanation');
    // The popover fades in: visible a moment after it is in the page.
    await waitFor(() => expect(text).toBeVisible());
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'));
  });
});

import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import SoloSettings from './SoloSettings';
import en from '../../../locales/en.json';

// John: the explanatory blocks under the Pools-tab fields were the only place
// the UI showed them open, as coloured boxes. They live behind an info button
// now, like the solo mining page; none of the text may be lost on the way.

let ctx;

jest.mock('../context/SettingsContext', () => ({ useSettings: () => ctx }));
jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceType: () => 'solo-node',
}));
jest.mock('../../../hooks/useNodeStorage', () => () => ({ state: 'ready' }));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: () => ({ data: {} }),
}));

const solo = en.settings.sections.solo;

beforeEach(() => {
  ctx = {
    settings: { pool: { username: 'w', url: '', password: 'x' }, btcsig: 'x', startdiff: 1024, mindiff: 1 },
    setSettings: () => {},
    setErrorForm: () => {},
  };
});

describe('SoloSettings info', () => {
  const infos = [
    ['wallet_address', 'wallet_info'],
    ['btc_signature', 'btc_signature_info'],
    ['startdiff', 'startdiff_info'],
    ['mindiff', 'mindiff_info'],
  ];

  it('does not print the explanations in the page', () => {
    renderWithProviders(<SoloSettings />);
    for (const [, info] of infos) {
      expect(screen.queryByText(solo[info])).not.toBeInTheDocument();
    }
  });

  it.each(infos)('%s has an info button that shows its full text', async (title, info) => {
    renderWithProviders(<SoloSettings />);

    const button = screen.getByRole('button', { name: `More information about ${solo[title]}` });
    fireEvent.click(button);

    const text = await screen.findByText(solo[info]);
    // The popover fades in: visible a moment after it is in the page.
    await waitFor(() => expect(text).toBeVisible());
  });
});

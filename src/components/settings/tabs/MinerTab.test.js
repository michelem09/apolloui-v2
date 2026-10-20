import { renderWithProviders, screen } from '../../../test-utils';
import MinerTab from './MinerTab';

let config;

jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => config,
}));
jest.mock('../sections/MinerModeSettings', () => function Modes() { return <div>modes</div>; });
jest.mock('../sections/FanSettings', () => function Fan() { return <div>fan</div>; });
jest.mock('../sections/PowerLedSettings', () => function Led() { return <div>led</div>; });

describe('MinerTab USB note', () => {
  it('shows the note on an Apollo III with USB boards', () => {
    config = { isHybrid: true };
    renderWithProviders(<MinerTab />);
    expect(screen.getByTestId('usb-legacy-note')).toHaveTextContent(/legacy mode/i);
  });

  it('shows nothing extra without USB boards', () => {
    config = { isHybrid: false };
    renderWithProviders(<MinerTab />);
    expect(screen.queryByTestId('usb-legacy-note')).not.toBeInTheDocument();
    expect(screen.getByText('modes')).toBeInTheDocument();
  });
});

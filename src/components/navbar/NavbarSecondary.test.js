import { renderWithProviders, screen } from '../../test-utils';
import NavbarSecondary from './NavbarSecondary';
import { useDeviceConfig } from '../../contexts/DeviceConfigContext';

jest.mock('../../contexts/DeviceConfigContext', () => ({ useDeviceConfig: jest.fn() }));

const mount = (minerOnline) =>
  renderWithProviders(
    <NavbarSecondary type="miner" minerOnline={minerOnline} handleSystemAction={jest.fn()} />
  );

describe('NavbarSecondary miner buttons', () => {
  it('Start is disabled when there is no board to start', () => {
    useDeviceConfig.mockReturnValue({ canStartMiner: false });
    mount('offline');
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled();
  });

  it('Start is enabled when a board can be started', () => {
    useDeviceConfig.mockReturnValue({ canStartMiner: true });
    mount('offline');
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled();
  });

  it('Restart is disabled when there is no board, Stop stays available', () => {
    useDeviceConfig.mockReturnValue({ canStartMiner: false });
    mount('online');
    expect(screen.getByRole('button', { name: /Restart/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Stop/ })).toBeEnabled();
  });

  it('Restart is enabled with a board', () => {
    useDeviceConfig.mockReturnValue({ canStartMiner: true });
    mount('online');
    expect(screen.getByRole('button', { name: /Restart/ })).toBeEnabled();
  });
});

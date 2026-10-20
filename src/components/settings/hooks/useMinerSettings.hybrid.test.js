import { renderHook, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { flattenMessages } from '../../../lib/utils';
import en from '../../../locales/en.json';
import { useMinerSettings } from './useMinerSettings';

// On an Apollo III a USB board being plugged in or expiring flips isHybrid while
// the user is in Settings -> Miner. That only changes the "Apollo III only" note
// on the super_eco preset; it must not re-run the recompute from the settings and
// throw away a choice the user has just made.
const draft = {
  settings: { minerMode: 'eco', minerHashrate: 12, fanTemp: null, fanPwm: null, powerLedOff: false },
  setSettings: jest.fn(),
  setErrorForm: jest.fn(),
};
let hybrid = false;
jest.mock('../context/SettingsContext', () => ({ useSettings: () => draft }));
jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ effectiveMinerFamily: 'apollo-iii', isHybrid: hybrid }),
}));

// Built once: new props per render would make a new intl and re-run
// every memo, which is not what is under test.
const messages = flattenMessages(en);
const onError = () => {};
const wrapper = ({ children }) => (
  <IntlProvider locale="en" messages={messages} onError={onError}>
    {children}
  </IntlProvider>
);

const selectedId = (r) => r.current.minerModes.find((m) => m.selected)?.id;
const badge = (r) => r.current.minerModes.find((m) => m.id === 'super_eco')?.alertBadge;

it('isHybrid flipping updates the note and keeps the unsaved preset choice', () => {
  hybrid = false;
  const { result, rerender } = renderHook(() => useMinerSettings(), { wrapper });
  expect(selectedId(result)).toBe('eco');
  expect(badge(result)).toBeUndefined();

  act(() => result.current.handleSwitchMinerMode({ target: { id: 'turbo' } }));
  expect(selectedId(result)).toBe('turbo');

  hybrid = true;
  rerender();
  expect(badge(result)).toMatch(/Apollo III/i);
  expect(selectedId(result)).toBe('turbo');

  hybrid = false;
  rerender();
  expect(badge(result)).toBeUndefined();
  expect(selectedId(result)).toBe('turbo');
});

import { renderHook, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { flattenMessages } from '../../../lib/utils';
import en from '../../../locales/en.json';
import useSettingsDraft from '../../../hooks/useSettingsDraft';
import { useNodeSettings } from './useNodeSettings';
import { useMinerSettings } from './useMinerSettings';

// The real working-copy state of the settings page, feeding the real hooks: the
// race is between the two, so neither can be stood in for.
let draft;
jest.mock('../context/SettingsContext', () => ({ useSettings: () => draft }));
jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ minerFamily: 'apollo-ii', isHybrid: false }),
}));

const wrapper = ({ children }) => (
  <IntlProvider locale="en" messages={flattenMessages(en)} onError={() => {}}>
    {children}
  </IntlProvider>
);

const saved = {
  nodeSoftware: 'core_28_1',
  nodeEnableTor: false,
  nodeAllowLan: false,
  nodeMaxConnections: 32,
  nodeUserConf: '',
  minerMode: 'eco',
  fan_low: 40,
  fan_high: 60,
  powerLedOff: false,
};

const mount = (hook) =>
  renderHook(
    () => {
      draft = { ...useSettingsDraft(), setErrorForm: jest.fn() };
      return { draft, view: hook() };
    },
    { wrapper }
  );

describe('a choice made before the saved settings arrive', () => {
  it('node software: survives the arrival and shows as an unsaved change', () => {
    const { result } = mount(useNodeSettings);

    act(() => result.current.view.handleNodeSoftwareChange('knots_29_3'));
    expect(result.current.view.nodeSoftware).toBe('knots_29_3');

    act(() => result.current.draft.loadSettings(saved));

    expect(result.current.view.nodeSoftware).toBe('knots_29_3');
    expect(result.current.draft.settings.nodeSoftware).toBe('knots_29_3');
    // The baseline is what the device has, so the page sees a difference to save.
    expect(result.current.draft.currentSettings.nodeSoftware).toBe('core_28_1');
    expect(result.current.draft.settings.initial).toBeUndefined();
    // Everything the user did not touch comes from the device.
    expect(result.current.view.nodeMaxConnections).toBe(32);
  });

  it('node toggles and connections: same', () => {
    const { result } = mount(useNodeSettings);

    act(() => result.current.view.handleSwitchNodeTorMode({ target: { value: 'false' } }));
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.loadSettings(saved));

    expect(result.current.view.nodeTorMode.selected).toBe(true);
    expect(result.current.view.nodeMaxConnections).toBe(12);
    expect(result.current.view.nodeAllowLan.selected).toBe(false);
  });

  it('miner mode: same', () => {
    const { result } = mount(useMinerSettings);

    act(() => result.current.view.handleSwitchMinerMode({ target: { id: 'turbo' } }));
    act(() => result.current.draft.loadSettings(saved));

    expect(result.current.draft.settings.minerMode).toBe('turbo');
    expect(result.current.view.minerModes.find((m) => m.selected).id).toBe('turbo');
  });

  it('without a click the saved values are shown, and the baseline equals the copy', () => {
    const { result } = mount(useNodeSettings);

    act(() => result.current.draft.loadSettings(saved));

    expect(result.current.view.nodeSoftware).toBe('core_28_1');
    expect(result.current.draft.settings).toEqual(saved);
    expect(result.current.draft.currentSettings).toEqual(saved);
  });

  it('after the first answer a later one still replaces the copy (as before)', () => {
    const { result } = mount(useNodeSettings);
    act(() => result.current.draft.loadSettings(saved));
    act(() => result.current.view.handleNodeSoftwareChange('knots_29_3'));
    act(() => result.current.draft.loadSettings({ ...saved, nodeSoftware: 'core_29_0' }));

    expect(result.current.draft.settings.nodeSoftware).toBe('core_29_0');
  });

  it('Discard returns to the saved value', () => {
    const { result } = mount(useNodeSettings);
    act(() => result.current.view.handleNodeSoftwareChange('knots_29_3'));
    act(() => result.current.draft.loadSettings(saved));
    act(() => result.current.draft.setSettings(result.current.draft.currentSettings));

    expect(result.current.view.nodeSoftware).toBe('core_28_1');
  });
});

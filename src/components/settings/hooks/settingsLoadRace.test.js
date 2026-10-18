import { renderHook, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { flattenMessages } from '../../../lib/utils';
import en from '../../../locales/en.json';
import useSettingsDraft from '../../../hooks/useSettingsDraft';
import { useNodeSettings } from './useNodeSettings';
import { useMinerSettings } from './useMinerSettings';
import fs from 'fs';
import path from 'path';

// The real working-copy state of the settings page, feeding the real hooks: the
// race is between the two, so neither can be stood in for.
let draft;
jest.mock('../context/SettingsContext', () => ({ useSettings: () => draft }));
let family = 'apollo-ii';
jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ minerFamily: family, isHybrid: false }),
}));
beforeEach(() => {
  family = 'apollo-ii';
});

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

describe('Apollo III custom mode picked before the saved settings arrive', () => {
  it('keeps the saved hashrate instead of the default', () => {
    family = 'apollo-iii';
    const { result } = mount(useMinerSettings);

    act(() => result.current.view.handleSwitchMinerMode({ target: { id: 'custom' } }));
    act(() => result.current.draft.loadSettings({ ...saved, minerHashrate: 15 }));

    expect(result.current.draft.settings.minerMode).toBe('custom');
    expect(result.current.draft.settings.minerHashrate).toBe(15);
  });

  it('still gets the default hashrate when none was saved', () => {
    family = 'apollo-iii';
    const { result } = mount(useMinerSettings);

    act(() => result.current.view.handleSwitchMinerMode({ target: { id: 'custom' } }));
    act(() => result.current.draft.loadSettings({ ...saved, minerHashrate: null }));

    expect(result.current.draft.settings.minerHashrate).toBe(12);
  });
});

describe('the system timezone seed', () => {
  it('does not replace a zone picked before the settings arrived', () => {
    const { result } = mount(useNodeSettings);

    act(() => result.current.draft.setSettings({ ...result.current.draft.settings, timezone: 'Europe/Rome' }));
    act(() => result.current.draft.loadSettings(saved));
    act(() => result.current.draft.seedTimezone('UTC'));

    expect(result.current.draft.settings.timezone).toBe('Europe/Rome');
    expect(result.current.draft.currentSettings.timezone).toBe('UTC');
  });

  it('seeds both sides when nothing was picked', () => {
    const { result } = mount(useNodeSettings);

    act(() => result.current.draft.loadSettings(saved));
    act(() => result.current.draft.seedTimezone('UTC'));

    expect(result.current.draft.settings.timezone).toBe('UTC');
    expect(result.current.draft.currentSettings.timezone).toBe('UTC');
  });
});

describe('the settings page', () => {
  // The page is not mounted here (it needs the whole app around it), so the link
  // to the hook is held by its source: a plain setSettings on arrival brings the
  // race back.
  const src = fs.readFileSync(path.join(__dirname, '../../../pages/settings/[tab].js'), 'utf8');

  it('gets its state from useSettingsDraft and loads through it', () => {
    expect(src).toMatch(/=\s*useSettingsDraft\(\)/);
    expect(src).toMatch(/loadSettings\(finalSettings\)/);
    expect(src).toMatch(/seedTimezone\(systemTimezone\)/);
    expect(src).not.toMatch(/setSettings\(finalSettings\)/);
  });
});

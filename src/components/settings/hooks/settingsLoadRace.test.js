import { renderHook, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { flattenMessages } from '../../../lib/utils';
import en from '../../../locales/en.json';
import useSettingsDraft from '../../../hooks/useSettingsDraft';
import { useNodeSettings } from './useNodeSettings';
import { useMinerSettings } from './useMinerSettings';
import { usePasswordSettings } from './usePasswordSettings';
import isEqual from 'lodash/isEqual';
import fs from 'fs';
import path from 'path';

// The real working-copy state of the settings page, feeding the real hooks: the
// race is between the two, so neither can be stood in for.
let draft;
jest.mock('../context/SettingsContext', () => ({ useSettings: () => draft }));
let family = 'apollo-ii';
jest.mock('../../../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ minerFamily: family, effectiveMinerFamily: family, isHybrid: false }),
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

// Stable, like the page's own setter: an effect depends on it.
const noop = () => {};
const mount = (hook) =>
  renderHook(
    () => {
      draft = { ...useSettingsDraft(), setErrorForm: jest.fn(), setIsChanged: noop };
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

  // Used to assert the opposite (a later answer replaced the whole copy), which
  // is the defect: a pick made while a reload is in flight was silently undone.
  it('after the first answer a later one keeps the pending pick', () => {
    const { result } = mount(useNodeSettings);
    act(() => result.current.draft.loadSettings(saved));
    act(() => result.current.view.handleNodeSoftwareChange('knots_29_3'));
    act(() => result.current.draft.loadSettings({ ...saved, nodeSoftware: 'core_29_0' }));

    expect(result.current.draft.settings.nodeSoftware).toBe('knots_29_3');
    expect(result.current.draft.currentSettings.nodeSoftware).toBe('core_29_0');
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

describe('data that arrives after the first load', () => {
  const server = {
    ...saved,
    temperatureUnit: 'C',
    pool: { url: 'a', username: 'u', password: 'x', enabled: true },
    backupPool: { url: '', username: '', password: 'x', enabled: false },
  };
  const loaded = (draftResult) => draftResult.current.draft;

  // Mounts the hook with the settings already loaded and a zone seeded.
  const ready = () => {
    const { result } = mount(useNodeSettings);
    act(() => result.current.draft.loadSettings(server));
    act(() => result.current.draft.seedTimezone('Africa/Abidjan'));
    return result;
  };

  it('keeps a timezone picked while the reload after a save is in flight', () => {
    const result = ready();
    // The save of another field starts, the zone is then picked, the reload lands.
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.draft.setSettings((s) => ({ ...s, timezone: 'Europe/Rome' })));
    act(() => result.current.draft.loadSettings({ ...server, temperatureUnit: 'F' }));

    expect(loaded(result).settings.timezone).toBe('Europe/Rome');
    // ...and it is still an unsaved change against the device's zone.
    expect(loaded(result).currentSettings.timezone).toBe('Africa/Abidjan');
  });

  it('keeps an edit made during any later arrival, not only the first', () => {
    const result = ready();
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 41 }));

    expect(loaded(result).settings.nodeMaxConnections).toBe(12);
    // Untouched fields and the baseline follow the device.
    expect(loaded(result).settings.fan_low).toBe(41);
    expect(loaded(result).currentSettings.fan_low).toBe(41);
    expect(loaded(result).currentSettings.nodeMaxConnections).toBe(32);
  });

  it('keeps one field of a pool without freezing the others', () => {
    const result = ready();
    act(() =>
      result.current.draft.setSettings((s) => ({ ...s, pool: { ...s.pool, url: 'typed' } }))
    );
    act(() =>
      result.current.draft.loadSettings({ ...server, pool: { ...server.pool, username: 'new' } })
    );

    expect(loaded(result).settings.pool).toEqual({
      url: 'typed',
      username: 'new',
      password: 'x',
      enabled: true,
    });
  });

  it('after a save, the saved fields take the device value, normalised or not', () => {
    const result = ready();
    act(() =>
      result.current.draft.setSettings((s) => ({ ...s, pool: { ...s.pool, url: ' b ' } }))
    );
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() =>
      result.current.draft.loadSettings({ ...server, pool: { ...server.pool, url: 'b' } })
    );

    expect(loaded(result).settings.pool.url).toBe('b');
    expect(loaded(result).currentSettings.pool.url).toBe('b');
  });

  it('the save snapshot serves one arrival only', () => {
    const result = ready();
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 41 }));
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 42 }));

    expect(loaded(result).settings.fan_low).toBe(42);
  });

  it('a failed save does not leave the working copy open to being overwritten', () => {
    const result = ready();
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.draft.markSaved(null));
    act(() => result.current.draft.loadSettings(server));

    expect(loaded(result).settings.nodeMaxConnections).toBe(12);
  });

  it('a restore replaces pending edits', () => {
    const result = ready();
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.requestReplace());
    act(() => result.current.draft.loadSettings({ ...server, nodeMaxConnections: 64 }));

    expect(loaded(result).settings.nodeMaxConnections).toBe(64);
    // The zone is not in a backup: the baseline keeps it.
    expect(loaded(result).currentSettings.timezone).toBe('Africa/Abidjan');
  });

  it('a restore keeps the zone in the working copy too, and nothing is left to save', () => {
    const result = ready();
    act(() => result.current.draft.requestReplace());
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 45 }));

    expect(loaded(result).settings.timezone).toBe('Africa/Abidjan');
    expect(isEqual(loaded(result).settings, loaded(result).currentSettings)).toBe(true);
  });

  it('a restore drops a pending zone pick and a lock password pair', () => {
    const result = ready();
    act(() =>
      result.current.draft.setSettings((s) => ({
        ...s,
        timezone: 'Europe/Rome',
        lockPassword: 'secret123',
        verifyLockpassword: 'secret123',
      }))
    );
    act(() => result.current.draft.requestReplace());
    act(() => result.current.draft.loadSettings(server));

    expect(loaded(result).settings.timezone).toBe('Africa/Abidjan');
    expect(loaded(result).settings.lockPassword).toBeUndefined();
    expect(isEqual(loaded(result).settings, loaded(result).currentSettings)).toBe(true);
  });

  it('a restore that brought nothing new does not turn the next reload into a replace', () => {
    const result = ready();
    act(() => result.current.draft.requestReplace()); // identical data: no arrival
    act(() => result.current.draft.settle());
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 41 }));

    expect(loaded(result).settings.nodeMaxConnections).toBe(12);
  });

  it('a save that brought nothing new does not leave its snapshot armed', () => {
    const result = ready();
    act(() =>
      result.current.draft.setSettings((s) => ({ ...s, pool: { ...s.pool, url: 'typed' } }))
    );
    // The write went through but the device answers with what it had: no arrival.
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.draft.settle());
    act(() =>
      result.current.draft.loadSettings({ ...server, pool: { ...server.pool, url: 'other' } })
    );

    expect(loaded(result).settings.pool.url).toBe('typed');
  });

  it('the latest request owns the next arrival', () => {
    const result = ready();
    act(() => result.current.draft.requestReplace());
    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.loadSettings({ ...server, fan_low: 41 }));
    // markSaved won: the snapshot predates the edit, so the edit is kept.
    expect(loaded(result).settings.nodeMaxConnections).toBe(12);

    act(() => result.current.draft.markSaved(loaded(result).settings));
    act(() => result.current.draft.requestReplace());
    act(() => result.current.draft.loadSettings({ ...server, nodeMaxConnections: 64 }));
    expect(loaded(result).settings.nodeMaxConnections).toBe(64);
  });

  it('discard returns to the baseline', () => {
    const result = ready();
    act(() => result.current.view.handleNodeMaxConnections({ target: { value: '12' } }));
    act(() => result.current.draft.setSettings(loaded(result).currentSettings));

    expect(loaded(result).settings).toEqual(loaded(result).currentSettings);
  });
});

describe('after a password change was applied', () => {
  const server = { ...saved, temperatureUnit: 'C' };

  it('the pair leaves the working copy and the fields, so the bar clears and a later save is not a password change', () => {
    const { result } = mount(usePasswordSettings);
    act(() => result.current.draft.loadSettings(server));
    act(() => result.current.view.setLockPassword('secret123'));
    act(() => result.current.view.setVerifyLockPassword('secret123'));
    act(() => result.current.draft.setSettings((s) => ({ ...s, temperatureUnit: 'F' })));
    expect(result.current.draft.settings.lockPassword).toBe('secret123');

    // The save: snapshot, then (page) the pair is forgotten after the password step.
    act(() => result.current.draft.markSaved(result.current.draft.settings));
    act(() => result.current.draft.forgetPasswordPair());
    act(() => result.current.draft.loadSettings({ ...server, temperatureUnit: 'F' }));

    const { settings, currentSettings } = result.current.draft;
    expect(settings.lockPassword).toBeUndefined();
    expect(settings.verifyLockpassword).toBeUndefined();
    expect(isEqual(settings, currentSettings)).toBe(true);
    expect(result.current.view.lockPassword).toBe('');
    expect(result.current.view.verifyLockpassword).toBe('');
  });

  it('shortening the fields afterwards still just takes the pair back', () => {
    const { result } = mount(usePasswordSettings);
    act(() => result.current.draft.loadSettings(server));
    act(() => result.current.view.setLockPassword('secret123'));
    act(() => result.current.view.setVerifyLockPassword('secret123'));
    act(() => result.current.view.setLockPassword('short'));

    expect(result.current.draft.settings.lockPassword).toBeUndefined();
    expect(result.current.view.lockPassword).toBe('short');
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
    expect(src).toMatch(/markSaved\(settings\)/);
    expect(src).toMatch(/requestReplace\(\)/);
    // The password pair is forgotten once its step went through, and both flags
    // are settled after the refetches of a save and of a restore.
    expect(src).toMatch(/if \(changePassword\) \{[^}]*forgetPasswordPair\(\)/);
    expect(src.match(/setReloadSettled\(\(n\) => n \+ 1\)/g)).toHaveLength(2);
    expect(src).toMatch(/if \(reloadSettled\) settle\(\)/);
    // A failed save disarms the snapshot.
    expect(src).toMatch(/if \(!saved\.ok\) \{\s*markSaved\(null\)/);
    expect(src).toMatch(/seedTimezone\(systemTimezone\)/);
    expect(src).not.toMatch(/setSettings\(finalSettings\)/);
  });
});

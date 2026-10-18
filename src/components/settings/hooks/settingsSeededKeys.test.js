import { renderHook, act } from '@testing-library/react';
import isEqual from 'lodash/isEqual';
import useSettingsDraft from '../../../hooks/useSettingsDraft';

// Zone and location are seeded by the page from other queries and are not settings
// rows: a reload must not make the two sides differ on them.
const seeded = () => {
  const r = renderHook(() => useSettingsDraft());
  act(() => r.result.current.loadSettings({ minerMode: 'eco' }));
  act(() => {
    r.result.current.seedTimezone('Europe/Rome');
    const patch = (s) => ({ ...s, latitude: 10, longitude: 20, _locationSeeded: true });
    r.result.current.setSettings(patch);
    r.result.current.setCurrentSettings(patch);
  });
  return r.result;
};

describe('seeded keys across a reload', () => {
  it('working copy and baseline stay equal after an unrelated reload', () => {
    const result = seeded();
    expect(isEqual(result.current.settings, result.current.currentSettings)).toBe(true);
    act(() => result.current.loadSettings({ minerMode: 'eco', nodeEnableTor: true }));
    expect(result.current.currentSettings).toMatchObject({
      timezone: 'Europe/Rome', latitude: 10, longitude: 20, _locationSeeded: true,
    });
    expect(isEqual(result.current.settings, result.current.currentSettings)).toBe(true);
  });

  it('a pending location edit survives an unrelated reload and stays a difference', () => {
    const result = seeded();
    act(() => result.current.setSettings((s) => ({ ...s, latitude: 99 })));
    act(() => result.current.loadSettings({ minerMode: 'eco', nodeEnableTor: true }));
    expect(result.current.settings.latitude).toBe(99);
    expect(result.current.currentSettings.latitude).toBe(10);
  });

  it('a restore takes zone and location from the baseline', () => {
    const result = seeded();
    act(() => result.current.setSettings((s) => ({ ...s, latitude: 99, timezone: 'Asia/Tokyo' })));
    act(() => result.current.requestReplace());
    act(() => result.current.loadSettings({ minerMode: 'turbo' }));
    expect(result.current.settings).toMatchObject({ minerMode: 'turbo', timezone: 'Europe/Rome', latitude: 10 });
    expect(isEqual(result.current.settings.latitude, result.current.currentSettings.latitude)).toBe(true);
  });
});

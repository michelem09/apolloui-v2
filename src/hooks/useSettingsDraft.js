import { useState, useCallback } from 'react';

// The settings page's working copy (`settings`) and the saved baseline
// (`currentSettings`) it is compared against. The page mounts its controls before
// the device has answered, with `{ initial: true }` as the working copy, so a
// click can land in that window. Whatever the user picked there is carried over
// the arrival of the saved values instead of being replaced by them: it stays an
// unsaved change (working copy differs from baseline), and the save bar shows.
export default function useSettingsDraft() {
  const [settings, setSettings] = useState({ initial: true });
  const [currentSettings, setCurrentSettings] = useState();

  const loadSettings = useCallback((loaded) => {
    setSettings((prev) => {
      if (!prev || !prev.initial) return loaded;
      // eslint-disable-next-line no-unused-vars
      const { initial, ...edits } = prev;
      return { ...loaded, ...edits };
    });
    setCurrentSettings(loaded);
  }, []);

  // The device's current timezone goes into both sides, so picking a different
  // one lights up the save bar and picking the current one does not. A zone the
  // user already picked (the zone list can arrive before the settings do) stays.
  const seedTimezone = useCallback((timezone) => {
    setSettings((s) => (s && s.timezone ? s : { ...s, timezone }));
    setCurrentSettings((s) => ({ ...s, timezone }));
  }, []);

  return {
    settings,
    setSettings,
    currentSettings,
    setCurrentSettings,
    loadSettings,
    seedTimezone,
  };
}

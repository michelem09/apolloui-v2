import { useState, useCallback, useRef } from 'react';
import isEqual from 'lodash/isEqual';

// Keeps from `prev` what the user changed with respect to `reference` (the
// baseline the working copy was last aligned to) and takes the rest from `fresh`.
// One level down for the nested pool objects, so editing the URL of a pool does
// not freeze its other fields. Keys `fresh` does not carry (timezone, the lock
// password fields) are the working copy's own and stay.
const mergeKeepingEdits = (fresh, prev, reference) => {
  const out = { ...fresh };
  Object.keys(prev).forEach((key) => {
    const mine = prev[key];
    const was = reference?.[key];
    if (!(key in fresh)) {
      out[key] = mine;
    } else if (isEqual(mine, was)) {
      out[key] = fresh[key];
    } else if (
      mine && was && fresh[key] &&
      typeof mine === 'object' && typeof was === 'object' && typeof fresh[key] === 'object'
    ) {
      out[key] = mergeKeepingEdits(fresh[key], mine, was);
    } else {
      out[key] = mine;
    }
  });
  return out;
};

// The settings page's working copy (`settings`) and the saved baseline
// (`currentSettings`) it is compared against. The page mounts its controls before
// the device has answered, with `{ initial: true }` as the working copy, so a
// click can land in that window. Whatever the user picked there is carried over
// the arrival of the saved values instead of being replaced by them: it stays an
// unsaved change (working copy differs from baseline), and the save bar shows.
//
// The same holds for every later arrival (the reload after a save, the one after
// a restore): a field the user changed since the last time the working copy was
// aligned to the device is theirs and is kept; untouched fields follow the device.
// Two things replace instead: `markSaved` (a save just wrote the working copy, so
// what the device answers is the truth for those fields, normalised or not, while
// an edit made after the save is still kept) and `requestReplace` (a restore).
export default function useSettingsDraft() {
  const [settings, setSettings] = useState({ initial: true });
  const [currentSettings, setCurrentSettings] = useState();
  const baselineRef = useRef();
  baselineRef.current = currentSettings;
  const savedRef = useRef(null);
  const replaceRef = useRef(false);

  const loadSettings = useCallback((loaded) => {
    const replace = replaceRef.current;
    // What "untouched" is measured against: the working copy as it was saved, if a
    // save is in flight, else the baseline the last arrival set (plus the zone).
    const reference = savedRef.current || baselineRef.current;
    replaceRef.current = false;
    savedRef.current = null;
    setSettings((prev) => {
      // A restore brings no timezone (not a settings row) and a pending zone edit
      // is dropped with the rest, so the zone is the baseline's, never `prev`'s.
      // The lock password pair is not carried: a restore does not change it.
      if (replace) {
        const zone = baselineRef.current?.timezone;
        return zone && !('timezone' in loaded) ? { ...loaded, timezone: zone } : loaded;
      }
      if (!prev) return loaded;
      if (prev.initial) {
        // eslint-disable-next-line no-unused-vars
        const { initial, ...edits } = prev;
        return { ...loaded, ...edits };
      }
      return mergeKeepingEdits(loaded, prev, reference);
    });
    // The zone is not a settings row: the baseline keeps what it knew of it.
    setCurrentSettings((base) =>
      base && base.timezone && !('timezone' in loaded) ? { ...loaded, timezone: base.timezone } : loaded
    );
  }, []);

  // Call when a save starts, with the working copy being written.
  // The two flags are exclusive: the later request owns the next arrival.
  const markSaved = useCallback((written) => {
    savedRef.current = written;
    replaceRef.current = false;
  }, []);

  // Call before reloading after an explicit restore: its values win over pending edits.
  const requestReplace = useCallback(() => {
    replaceRef.current = true;
    savedRef.current = null;
  }, []);

  // Both flags are consumed only by an arrival, and Apollo does not emit identical
  // data again (a restore of what is already there, a save of the zone or the
  // password alone). The page calls this once the refetches of a save/restore have
  // resolved and their arrival has been loaded, so a flag nobody consumed cannot
  // turn the next, unrelated reload into a full replace.
  const settle = useCallback(() => {
    savedRef.current = null;
    replaceRef.current = false;
  }, []);

  // The lock password pair is written into the working copy by the password
  // section and is not a stored setting: once it has been applied it must leave
  // the working copy (the baseline never had it), or the bar stays lit and the
  // next save changes the password again.
  const forgetPasswordPair = useCallback(() => {
    setSettings((prev) => {
      if (!prev || (prev.lockPassword === undefined && prev.verifyLockpassword === undefined)) return prev;
      // eslint-disable-next-line no-unused-vars
      const { lockPassword, verifyLockpassword, ...rest } = prev;
      return rest;
    });
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
    markSaved,
    requestReplace,
    settle,
    forgetPasswordPair,
  };
}

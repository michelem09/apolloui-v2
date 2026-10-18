import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useIntl } from 'react-intl';

export const usePasswordSettings = () => {
  const intl = useIntl();
  const { settings, setSettings, setErrorForm, setIsChanged } = useSettings();

  // Stato locale delle password
  const [lockPassword, setLockPassword] = useState('');
  const [verifyLockpassword, setVerifyLockPassword] = useState('');
  const [showLockPassword, setShowLockPassword] = useState(false);
  const [isLockpasswordError, setIsLockpasswordError] = useState(false);

  // A pair that was valid a moment ago must not outlive the edit that made it
  // invalid: left in the settings, it would be saved by the next unrelated change
  // while the form shows an error.
  const dropPair = () =>
    setSettings((prev) => {
      if (prev.lockPassword === undefined && prev.verifyLockpassword === undefined) return prev;
      // eslint-disable-next-line no-unused-vars
      const { lockPassword: _l, verifyLockpassword: _v, ...rest } = prev;
      return rest;
    });

  // The page drops the validated pair from the settings once it has been applied
  // (see forgetPasswordPair): the fields then empty too, or the effect below would
  // write the same pair straight back. An edit that invalidates the pair empties
  // the fields' own state first, so only an outside removal matches here.
  const hadPair = useRef(false);
  const pairInSettings = settings.lockPassword !== undefined;
  useEffect(() => {
    if (hadPair.current && !pairInSettings && lockPassword && lockPassword === verifyLockpassword) {
      setLockPassword('');
      setVerifyLockPassword('');
    }
    hadPair.current = pairInSettings;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairInSettings]);

  // Validazione password
  useEffect(() => {
    if (!lockPassword || !verifyLockpassword) {
      setIsLockpasswordError(false);
      setIsChanged(false);
      dropPair();
    } else if (lockPassword.length < 8) {
      setIsLockpasswordError(intl.formatMessage({ id: 'settings.sections.system.password.error.required' }));
      setIsChanged(false);
      dropPair();
    } else if (lockPassword === verifyLockpassword) {
      setIsLockpasswordError(false);
      // Aggiorna il contesto globale con i valori validati
      setSettings((prev) => ({
        ...prev,
        lockPassword: lockPassword,
        verifyLockpassword: verifyLockpassword
      }));
      setIsChanged(true);
    } else {
      setIsLockpasswordError(intl.formatMessage({ id: 'settings.sections.system.password.error.match' }));
      setIsChanged(false);
      dropPair();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockPassword, verifyLockpassword, setSettings, setIsChanged, intl]);

  return {
    lockPassword,
    setLockPassword,
    verifyLockpassword,
    setVerifyLockPassword,
    showLockPassword,
    setShowLockPassword,
    isLockpasswordError
  };
};
import { saveFailureText } from './saveFailureText';
import en from '../locales/en.json';
import itLocale from '../locales/it.json';

const fmt = (messages) => ({ id, defaultMessage }, values = {}) => {
  const text = id.split('.').reduce((o, k) => o?.[k], messages) ?? defaultMessage;
  return text.replace(/\{(\w+)\}/g, (_, k) => values[k]);
};

describe('saveFailureText', () => {
  it('says the settings were not saved when the settings step was refused', () => {
    const saved = { ok: false, step: 'settings', message: 'raw', messageId: 'service_error.node.restart' };
    expect(saveFailureText(saved, fmt(en))).toBe('Settings not saved: Could not restart the Bitcoin node.');
    expect(saveFailureText(saved, fmt(itLocale))).toBe('Impostazioni non salvate: Impossibile riavviare il nodo Bitcoin.');
  });

  it('words a Tor refusal too', () => {
    const saved = { ok: false, step: 'settings', message: 'raw', messageId: 'service_error.tor.enable' };
    expect(saveFailureText(saved, fmt(en))).toBe('Settings not saved: Could not enable Tor.');
  });

  it('a refusal from another step is only worded, not "not saved"', () => {
    const saved = { ok: false, step: 'pools', message: 'raw', messageId: 'service_error.node.restart' };
    expect(saveFailureText(saved, fmt(en))).toBe('Could not restart the Bitcoin node.');
  });

  it('anything without a localised id keeps the backend message', () => {
    expect(saveFailureText({ ok: false, step: 'settings', message: 'Invalid input', messageId: null }, fmt(en))).toBe('Invalid input');
  });
});

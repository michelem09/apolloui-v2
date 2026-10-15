import en from './en.json';
import itLocale from './it.json';
import de from './de.json';
import es from './es.json';

const locales = { en, it: itLocale, de, es };

describe('automation.guards locale keys', () => {
  const keys = Object.keys(en.automation.guards).sort();

  it.each(['it', 'de', 'es'])('%s has the same keys as en', (name) => {
    expect(Object.keys(locales[name].automation.guards).sort()).toEqual(keys);
  });

  it('the Italian title is translated, not the English term', () => {
    expect(itLocale.automation.guards.title).toBe('Limiti di protezione');
  });

  it('no Italian string still calls them "guard rail"', () => {
    expect(JSON.stringify(itLocale)).not.toMatch(/guard rail/i);
  });
});

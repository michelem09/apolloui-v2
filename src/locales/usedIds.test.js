import fs from 'fs';
import path from 'path';
import enLocale from './en.json';
import itLocale from './it.json';
import deLocale from './de.json';
import esLocale from './es.json';
import { flattenMessages } from '../lib/utils';

// Every literal message id used in the source must exist in all four locales,
// otherwise react-intl logs "Missing translation" and falls back to English.
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [full] : [];
  });

const srcDir = path.join(__dirname, '..');
const ids = new Set();
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\b(?:id[:=]\s*|labelKey:\s*)['"]([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)['"]/g)) {
    ids.add(m[1]);
  }
}

describe('message ids used in src', () => {
  it('finds a sane number of ids (guards against a silently empty scan)', () => {
    expect(ids.size).toBeGreaterThan(200);
  });

  it.each([['en', enLocale], ['it', itLocale], ['de', deLocale], ['es', esLocale]])('%s has every id', (_name, locale) => {
    const flat = flattenMessages(locale);
    expect([...ids].filter((id) => !(id in flat)).sort()).toEqual([]);
  });
});

import { versionGt } from './semver';

// The UI decides whether to offer an update; backend/update decides whether to
// install one. They have to agree, or the button fails every time it is pressed.
describe('versionGt — the same ordering the updater gates on', () => {
  it('orders release cores numerically', () => {
    expect(versionGt('2.10.0', '2.9.0')).toBe(true);
    expect(versionGt('2.2.1', '2.2.0')).toBe(true);
    expect(versionGt('2.2.0', '2.2.1')).toBe(false);
  });

  it('ranks a release above its own prereleases', () => {
    // The case that produced a permanent badge and a button that always failed:
    // a device on 2.2.1 offered 2.2.1-rc9 by the channel. Any difference read as
    // "newer", and the updater then refused to move to an older version.
    expect(versionGt('2.2.1-rc9', '2.2.1')).toBe(false);
    expect(versionGt('2.2.1', '2.2.1-rc9')).toBe(true);
  });

  it('compares digit runs numerically inside a prerelease', () => {
    // Deliberately not strict semver: by the letter of the spec rc10 sorts below
    // rc9, which is correct and not what these tags mean.
    expect(versionGt('2.2.0-rc10', '2.2.0-rc9')).toBe(true);
    expect(versionGt('2.2.0-rc2', '2.2.0-rc10')).toBe(false);
    expect(versionGt('2.2.0-beta.10', '2.2.0-beta.2')).toBe(true);
  });

  it('says no for equal versions', () => {
    expect(versionGt('2.2.0', '2.2.0')).toBe(false);
    expect(versionGt('2.2.0-rc1', '2.2.0-rc1')).toBe(false);
  });

  it('offers nothing when a version cannot be parsed', () => {
    // Including the case where the channel is unreachable and the field is null:
    // announcing an update we cannot name is worse than staying quiet.
    expect(versionGt(null, '2.2.0')).toBe(false);
    expect(versionGt('2.2.0', null)).toBe(false);
    expect(versionGt('not-a-version', '2.2.0')).toBe(false);
  });
});

// The shared table, read by this suite AND by tests/ota/rollback.test.sh against
// the bash comparator. The UI decides whether to OFFER an update and the shell
// decides whether to INSTALL one; CI and the updater are now the same code, so
// this JavaScript is the last independent implementation of the rule and the
// only thing that can drift.
describe('agreement with the updater (shared fixture)', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');

  const raw = fs.readFileSync(
    path.join(__dirname, 'version-order.fixture.txt'),
    'utf8'
  );
  const cases = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [a, b, expected] = line.split(/\s+/);
      // `""` in the file means the empty string; the file has no way to write it.
      const unquote = (v) => (v === '""' ? '' : v);
      return { a: unquote(a), b: unquote(b), expected: expected === 'yes' };
    });

  it('has a table to read', () => {
    // A fixture that silently loaded zero cases would make every assertion below
    // vanish while the suite stayed green.
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases)('versionGt($a, $b) === $expected', ({ a, b, expected }) => {
    expect(versionGt(a, b)).toBe(expected);
  });
});

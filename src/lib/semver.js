// Version ordering, matching what backend/update does before it will install.
//
// The UI used to decide with a plain `!==`, so any difference read as "an update
// is available" — including a channel serving a version the updater will refuse.
// A device on a stable release pointed at a channel offering a prerelease of the
// same core showed a badge that never cleared and an Update button that failed
// every time, because version_gt ranks a release ABOVE its own prereleases.
//
// Deliberately NOT strict semver §11 on one point, and the same deviation the
// shell makes: digit runs are compared numerically, so rc10 outranks rc9. By the
// letter of the spec alphanumeric identifiers compare lexically, which puts rc10
// below rc9 — correct, and not what any of these tags mean.
const CORE = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

// rc9 -> rc0000000009, so a lexical compare orders them naturally.
const padDigits = (s) => s.replace(/\d+/g, (n) => n.padStart(10, '0'));

export function parseVersion(value) {
  const match = CORE.exec(String(value || '').trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || '',
  };
}

// True when `a` is a strictly newer version than `b`.
export function versionGt(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return false; // unparseable: offer nothing rather than a guess

  for (let i = 0; i < 3; i += 1) {
    if (va.core[i] > vb.core[i]) return true;
    if (va.core[i] < vb.core[i]) return false;
  }
  // Cores equal: a release outranks any prerelease of the same core.
  if (!va.prerelease && vb.prerelease) return true;
  if (va.prerelease && !vb.prerelease) return false;
  if (va.prerelease === vb.prerelease) return false;
  return padDigits(va.prerelease) > padDigits(vb.prerelease);
}

import { useQuery } from '@apollo/client';

// The update badge is the only way a customer learns a release exists.
//
// It was fetched once at mount and never again: a device left on a page — which
// is what a mining dashboard IS — never found out, and the refetch that would
// have corrected it ran only when the version modal was opened, which requires
// the badge that was never going to appear. Reported from the field as "to see
// the update I have to reload the page".
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
}));

describe('version discovery', () => {
  it('polls for a newer release instead of asking once at mount', () => {
    // Read from the module rather than rendering the whole navbar, which pulls
    // in the sidebar, the device config context and a dozen selectors. What has
    // to be true is a property of the call.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'NavbarLinksAdmin.js'),
      'utf8'
    );
    const call = src.match(/useQuery\(\s*MCU_VERSION_QUERY,\s*\{([\s\S]*?)\}\)/);
    expect(call).not.toBeNull();
    expect(call[1]).toContain('pollInterval');
    // cache-and-network, so a fresh navbar after an update reads a live value in
    // one round-trip instead of showing the pre-update version from cache for a
    // whole poll interval. cache-first is what made the badge lag post-update.
    expect(call[1]).toContain("fetchPolicy: 'cache-and-network'");

    // Not faster than the backend's own cache: below that it re-reads a cached
    // value and buys nothing. Not slower by much either — this is the latency
    // between publishing a release and a device offering it.
    const declared = src.match(/const VERSION_POLL_MS = ([^;]+);/);
    expect(declared).not.toBeNull();
    // eslint-disable-next-line no-eval
    const ms = eval(declared[1]);
    expect(ms).toBeGreaterThanOrEqual(60 * 1000);
    expect(ms).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('re-arms the poll when the backend comes back', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'NavbarLinksAdmin.js'),
      'utf8'
    );
    // Apollo Client stops a pollInterval that hits a network error and never
    // restarts it. The updater stops apollo-api for minutes, so the poll was
    // dead for the rest of the tab's life from the first update onwards —
    // measured on hardware: the badge appeared by itself in steady state, and
    // never after an update until a manual reload. Polling alone is not enough;
    // it has to be re-armed on the signal the app already has.
    expect(src).toContain('useWsConnectionStatus');
    const effect = src.match(/if \(wsStatus !== 'online'\) return;[\s\S]{0,200}/);
    expect(effect).not.toBeNull();
    expect(effect[0]).toContain('startPollingVersion(VERSION_POLL_MS)');
    expect(effect[0]).toContain('refetchVersion()');
  });

  it('refetches as soon as an update finishes, so the badge does not linger', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'NavbarLinksAdmin.js'),
      'utf8'
    );
    // Without this the navbar keeps offering the version the device has just
    // installed, for up to one poll interval, right next to a banner saying the
    // update succeeded.
    expect(src).toMatch(/state\.update\.outcome/);
    expect(src).toMatch(/if \(updateOutcome\) refetchVersion\(\)/);
  });
});

import { trimPoolEdges } from './poolOptions';

// What Settings → Pools sends to the backend, and the checks that gate it.
//
// Kept out of the page so the rules can be tested without rendering it. The URL
// and the worker are cut of edge whitespace before anything is checked or sent:
// a pasted " host:3333" used to be refused as an invalid pool. The password is
// sent as typed.
const URL_PATTERN = /^(stratum\+tcp:\/\/)?[a-zA-Z0-9.-]+:[0-9]+$/;

// → { error } | { pool, backupPool, pools }
export const buildPoolsInput = (settings) => {
  const pool = trimPoolEdges(settings?.pool) || {};
  const backupPool = trimPoolEdges(settings?.backupPool);
  const { enabled, url, username, password } = pool;

  if (!url) return { error: 'Pool URL is required' };
  if (!username) return { error: 'Pool username/wallet address is required' };
  if (!url.match(URL_PATTERN)) return { error: 'Invalid pool URL' };

  // The backup pool goes onto the same command line as the primary, so it gets
  // the same checks. Without them an empty worker produced a bare `-user2` and a
  // URL without a port was silently dropped, so failover the user had configured
  // never reached the miner.
  if (backupPool?.enabled) {
    if (!backupPool.url) return { error: 'Backup pool URL is required' };
    if (!backupPool.url.match(URL_PATTERN)) return { error: 'Invalid backup pool URL' };
    if (!backupPool.username) {
      return { error: 'Backup pool username/wallet address is required' };
    }
  }

  // Indices are the priority order the miner reads — generate() sorts by them
  // and takes the first as primary. Keeping whatever index the primary
  // happened to be stored with was a real hazard: the seeded pool carries
  // index 99, so adding a backup at 2 made the backup sort first and take all
  // the hashrate, paying out to the wrong address.
  const pools = [
    {
      enabled: enabled !== undefined ? enabled : true, // Default to true if not set
      url,
      username,
      password,
      index: 1,
    },
  ];

  // updateAll replaces the whole table, so the array IS the intent: leaving the
  // backup out of it is how switching it off removes it.
  if (backupPool?.enabled && backupPool.url) {
    pools.push({
      enabled: true,
      url: backupPool.url,
      username: backupPool.username,
      password: backupPool.password,
      index: 2,
    });
  }

  return { pool, backupPool, pools };
};

import { buildPoolsInput } from './poolsInput';

// John, 2026-10: "If you add a space before or after the pool url it throws
// error". Settings answered "Invalid pool URL" for a URL that only had a space
// at an edge; the worker was stored with the space.

const settings = (over = {}) => ({
  pool: { enabled: true, url: 'stratum+tcp://pool.example.com:3333', username: 'wallet.w1', password: 'x' },
  backupPool: { enabled: false },
  ...over,
});

describe('buildPoolsInput', () => {
  it('sends a clean pool as it is', () => {
    const { pools, error } = buildPoolsInput(settings());
    expect(error).toBeUndefined();
    expect(pools).toEqual([
      { enabled: true, url: 'stratum+tcp://pool.example.com:3333', username: 'wallet.w1', password: 'x', index: 1 },
    ]);
  });

  it('accepts a URL with a space before or after, and sends it trimmed', () => {
    for (const url of [' pool.example.com:3333', 'pool.example.com:3333 ', '  pool.example.com:3333\n']) {
      const { pools, error } = buildPoolsInput(settings({ pool: { ...settings().pool, url } }));
      expect(error).toBeUndefined();
      expect(pools[0].url).toBe('pool.example.com:3333');
    }
  });

  it('trims the worker and leaves the password alone', () => {
    const { pools } = buildPoolsInput(
      settings({ pool: { ...settings().pool, username: '  wallet.w1 ', password: ' p ' } })
    );
    expect(pools[0].username).toBe('wallet.w1');
    expect(pools[0].password).toBe(' p ');
  });

  it('trims the backup pool the same way', () => {
    const { pools, error } = buildPoolsInput(
      settings({
        backupPool: { enabled: true, url: ' backup.example.com:4444 ', username: ' w2 ', password: ' q ' },
      })
    );
    expect(error).toBeUndefined();
    expect(pools[1]).toEqual({
      enabled: true, url: 'backup.example.com:4444', username: 'w2', password: ' q ', index: 2,
    });
  });

  it('still refuses what is wrong beyond the edges', () => {
    expect(buildPoolsInput(settings({ pool: { ...settings().pool, url: 'pool example.com:3333' } })).error)
      .toBe('Invalid pool URL');
    expect(buildPoolsInput(settings({ pool: { ...settings().pool, url: '   ' } })).error)
      .toBe('Pool URL is required');
    expect(buildPoolsInput(settings({ pool: { ...settings().pool, username: '  ' } })).error)
      .toBe('Pool username/wallet address is required');
    expect(
      buildPoolsInput(settings({ backupPool: { enabled: true, url: 'backup.example.com', username: 'w' } })).error
    ).toBe('Invalid backup pool URL');
  });
});

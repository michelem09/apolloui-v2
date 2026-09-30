import { applyTimezone } from './applyTimezone';

// The finding this exists for: the timezone step sat between the saved settings
// and the restarts that make them take effect, and returned early on a refused
// zone. Changing the miner mode and the timezone together then wrote
// miner_config and left the running binary on the old one.

const run = (over = {}) =>
  applyTimezone({
    wanted: 'Europe/Rome',
    current: 'America/New_York',
    setTimezone: jest.fn().mockResolvedValue({
      data: { Mcu: { setTimezone: { result: { timezone: 'Europe/Rome' }, error: null } } },
    }),
    refetch: jest.fn(),
    ...over,
  });

describe('applyTimezone', () => {
  it('applies the zone and refreshes what the panel reads', async () => {
    const setTimezone = jest.fn().mockResolvedValue({
      data: { Mcu: { setTimezone: { result: { timezone: 'Europe/Rome' }, error: null } } },
    });
    const refetch = jest.fn();

    const feedback = await run({ setTimezone, refetch });

    expect(setTimezone).toHaveBeenCalledWith({
      variables: { input: { timezone: 'Europe/Rome' } },
    });
    expect(refetch).toHaveBeenCalled();
    expect(feedback).toEqual([]);
  });

  it('reports a refused zone instead of throwing', async () => {
    const feedback = await run({
      setTimezone: jest.fn().mockResolvedValue({
        data: { Mcu: { setTimezone: { result: null, error: { message: 'Unknown timezone: Mars/Olympus' } } } },
      }),
    });

    expect(feedback).toEqual([
      { message: 'Unknown timezone: Mars/Olympus', type: 'error' },
    ]);
  });

  it('reports a request that never landed instead of throwing', async () => {
    const feedback = await run({
      setTimezone: jest.fn().mockRejectedValue(new Error('Failed to fetch')),
    });

    expect(feedback).toEqual([{ message: 'Failed to fetch', type: 'error' }]);
  });

  it('does not refetch after a refusal — it would just re-read the old zone', async () => {
    const refetch = jest.fn();

    await run({
      refetch,
      setTimezone: jest.fn().mockResolvedValue({
        data: { Mcu: { setTimezone: { result: null, error: { message: 'nope' } } } },
      }),
    });

    expect(refetch).not.toHaveBeenCalled();
  });

  it('does nothing when the zone did not change', async () => {
    const setTimezone = jest.fn();

    const feedback = await run({ wanted: 'Europe/Rome', current: 'Europe/Rome', setTimezone });

    expect(setTimezone).not.toHaveBeenCalled();
    expect(feedback).toEqual([]);
  });

  it('does nothing when there is no zone to apply', async () => {
    const setTimezone = jest.fn();

    await run({ wanted: undefined, setTimezone });

    expect(setTimezone).not.toHaveBeenCalled();
  });
});

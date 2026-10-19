import { isEqual, pick } from 'lodash';
import {
  SOLO_RESTART_FIELDS,
  minerRestartFieldsFor,
  nodeRestartNeeded,
  restartTypeFor,
  serviceKnownStopped,
  restartPlanFor,
  savedMessageIdFor,
} from './settingsRestart';

describe('nodeRestartNeeded', () => {
  it('is false when nothing on the node changed', () => {
    expect(
      nodeRestartNeeded({ fieldsChanged: false, nodeRunning: true, storageUsable: true })
    ).toBe(false);
  });

  it('restarts when the drive is fine', () => {
    expect(
      nodeRestartNeeded({ fieldsChanged: true, nodeRunning: false, storageUsable: true })
    ).toBe(true);
  });

  // The user-facing half: with no drive the node is down and systemd will refuse
  // to start it, so "Save & Restart" would promise a restart that cannot happen.
  it('does not promise a restart for a down node with nowhere to live', () => {
    expect(
      nodeRestartNeeded({ fieldsChanged: true, nodeRunning: false, storageUsable: false })
    ).toBe(false);
  });

  // The dangerous half: the probe can be wrong. A node that is actually running
  // must be restarted, or the save reports success and applies nothing.
  it('restarts a running node whatever the probe says about the drive', () => {
    expect(
      nodeRestartNeeded({ fieldsChanged: true, nodeRunning: true, storageUsable: false })
    ).toBe(true);
  });

  // Before the device has answered, storage is unknown — not "no drive".
  it('restarts while the storage answer is still unknown', () => {
    expect(
      nodeRestartNeeded({ fieldsChanged: true, nodeRunning: false, storageUsable: null })
    ).toBe(true);
  });
});

describe('restartTypeFor', () => {
  it.each([
    [{ miner: false, solo: false, node: false }, null],
    [{ miner: true, solo: false, node: false }, 'miner'],
    [{ miner: false, solo: true, node: false }, 'solo'],
    [{ miner: false, solo: false, node: true }, 'node'],
    [{ miner: true, solo: false, node: true }, 'both'],
    [{ miner: false, solo: true, node: true }, 'both'],
  ])('%o -> %s', (input, expected) => {
    expect(restartTypeFor(input)).toBe(expected);
  });
});

describe('serviceKnownStopped', () => {
  it('is true only for offline', () => {
    expect(serviceKnownStopped({ status: 'offline' })).toBe(true);
  });

  it.each([['online'], ['pending'], ['error'], ['unknown'], [undefined]])(
    'is false for %s',
    (status) => {
      expect(serviceKnownStopped({ status })).toBe(false);
    }
  );

  it('is false when there is no data yet', () => {
    expect(serviceKnownStopped(undefined)).toBe(false);
    expect(serviceKnownStopped(null)).toBe(false);
  });
});

describe('restartPlanFor', () => {
  const miner = (status) => (status === undefined ? undefined : { status });
  const base = {
    deviceType: 'apollo',
    minerFieldsChanged: true,
    soloFieldsChanged: false,
    nodeNeeded: false,
  };

  it('does not restart a stopped miner and says so', () => {
    expect(restartPlanFor({ ...base, minerService: miner('offline') })).toEqual({
      type: null,
      skipped: 'miner',
    });
  });

  it('treats a miner that is being stopped as stopped', () => {
    expect(
      restartPlanFor({ ...base, minerService: { status: 'pending', requestedStatus: 'offline' } })
    ).toEqual({ type: null, skipped: 'miner' });
  });

  it('restarts a miner that is still starting, so it picks up the config', () => {
    expect(
      restartPlanFor({ ...base, minerService: { status: 'pending', requestedStatus: 'online' } })
    ).toEqual({ type: 'miner', skipped: null });
  });

  it.each([['online'], ['pending'], ['error'], [undefined]])(
    'restarts the miner when its status is %s',
    (status) => {
      expect(restartPlanFor({ ...base, minerService: miner(status) })).toEqual({
        type: 'miner',
        skipped: null,
      });
    }
  );

  it('has nothing to skip when no startup field changed', () => {
    expect(
      restartPlanFor({ ...base, minerFieldsChanged: false, minerService: miner('offline') })
    ).toEqual({ type: null, skipped: null });
  });

  it('skips only the stopped miner when the node also needs a restart', () => {
    expect(
      restartPlanFor({ ...base, nodeNeeded: true, minerService: miner('offline') })
    ).toEqual({ type: 'node', skipped: 'miner' });
  });

  it('keeps both when the miner is up and the node needs a restart', () => {
    expect(
      restartPlanFor({ ...base, nodeNeeded: true, minerService: miner('online') })
    ).toEqual({ type: 'both', skipped: null });
  });

  describe('solo-node', () => {
    const solo = { ...base, deviceType: 'solo-node', minerFieldsChanged: false, soloFieldsChanged: true };

    it('does not restart a stopped solo pool and says so', () => {
      expect(restartPlanFor({ ...solo, soloService: { status: 'offline' } })).toEqual({
        type: null,
        skipped: 'solo',
      });
    });

    it('treats a solo pool that is being stopped as stopped', () => {
      expect(
        restartPlanFor({ ...solo, soloService: { status: 'pending', requestedStatus: 'offline' } })
      ).toEqual({ type: null, skipped: 'solo' });
    });

    it('restarts a solo pool that is still starting', () => {
      expect(
        restartPlanFor({ ...solo, soloService: { status: 'pending', requestedStatus: 'online' } })
      ).toEqual({ type: 'solo', skipped: null });
    });

    it.each([['online'], ['pending'], [undefined]])(
      'restarts the solo pool when its status is %s',
      (status) => {
        expect(restartPlanFor({ ...solo, soloService: miner(status) })).toEqual({
          type: 'solo',
          skipped: null,
        });
      }
    );

    it('skips only the stopped solo pool when the node needs a restart', () => {
      expect(
        restartPlanFor({ ...solo, nodeNeeded: true, soloService: { status: 'offline' } })
      ).toEqual({ type: 'node', skipped: 'solo' });
    });

    // The wallet address is the pool username: one edit, mined to by a USB miner.
    describe('USB miner present', () => {
      const wallet = { ...solo, soloFieldsChanged: false, minerFieldsChanged: true };
      const online = { status: 'online' };

      it.each([
        ['online', { status: 'online' }, undefined],
        ['asked to start', { status: 'pending', requestedStatus: 'online' }, undefined],
        ['seen at boot, status unknown yet', undefined, true],
        ['seen at boot, still starting', { status: 'pending', requestedStatus: 'online' }, true],
      ])('restarts the miner and not ckpool (%s)', (_n, minerService, hasUsbMiners) => {
        expect(restartPlanFor({ ...wallet, minerService, hasUsbMiners })).toEqual({
          type: 'miner',
          skipped: null,
        });
      });

      it('does not start a miner the user stopped (seen at boot), and says so', () => {
        expect(
          restartPlanFor({ ...wallet, minerService: { status: 'offline' }, hasUsbMiners: true })
        ).toEqual({ type: null, skipped: 'miner' });
      });

      it('does not start a miner being stopped (seen at boot), and says so', () => {
        expect(
          restartPlanFor({
            ...wallet,
            minerService: { status: 'pending', requestedStatus: 'offline' },
            hasUsbMiners: true,
          })
        ).toEqual({ type: null, skipped: 'miner' });
      });

      it('keeps the node last when it needs a restart too', () => {
        expect(restartPlanFor({ ...wallet, nodeNeeded: true, minerService: online })).toEqual({
          type: 'miner+node',
          skipped: null,
        });
      });

      it('restarts ckpool, then the miner, when solo mining is switched too', () => {
        expect(
          restartPlanFor({ ...wallet, soloFieldsChanged: true, soloService: online, minerService: online })
        ).toEqual({ type: 'solo+miner', skipped: null });
      });

      it('restarts only the miner when ckpool is stopped, and says so', () => {
        expect(
          restartPlanFor({
            ...wallet,
            soloFieldsChanged: true,
            soloService: { status: 'offline' },
            minerService: online,
          })
        ).toEqual({ type: 'miner', skipped: 'solo' });
      });

      it('does not restart the miner when no miner field changed', () => {
        expect(
          restartPlanFor({ ...wallet, minerFieldsChanged: false, minerService: online, hasUsbMiners: true })
        ).toEqual({ type: null, skipped: null });
      });
    });

    describe('no USB miner (the unit loops in auto-restart)', () => {
      const wallet = { ...solo, soloFieldsChanged: false, minerFieldsChanged: true };

      it.each([
        [{ status: 'offline' }],
        [{ status: 'pending', requestedStatus: null }],
        [{ status: 'pending' }],
        [{ status: 'pending', requestedStatus: 'offline' }],
        [{ status: 'error' }],
        [undefined],
      ])('does nothing and says nothing (%j)', (minerService) => {
        expect(restartPlanFor({ ...wallet, minerService, hasUsbMiners: false })).toEqual({
          type: null,
          skipped: null,
        });
      });
    });

    it('restarts only ckpool when solo mining is switched and no miner field changed', () => {
      expect(
        restartPlanFor({
          ...solo,
          minerFieldsChanged: false,
          soloService: { status: 'online' },
          minerService: { status: 'online' },
          hasUsbMiners: true,
        })
      ).toEqual({ type: 'solo', skipped: null });
    });

    it('does not restart the miner when only the node needs it', () => {
      expect(
        restartPlanFor({
          ...base,
          deviceType: 'solo-node',
          minerFieldsChanged: false,
          soloFieldsChanged: false,
          nodeNeeded: true,
          minerService: { status: 'online' },
          hasUsbMiners: true,
        })
      ).toEqual({ type: 'node', skipped: null });
    });
  });

  it('ignores a stopped solo service on a miner device', () => {
    expect(
      restartPlanFor({
        ...base,
        soloFieldsChanged: true,
        minerService: miner('online'),
        soloService: { status: 'offline' },
      })
    ).toEqual({ type: 'miner', skipped: null });
  });
});

describe('minerRestartFieldsFor', () => {
  it('keeps the solo-mining switch out on a solo-node: it leaves miner_config alone', () => {
    expect(minerRestartFieldsFor('solo-node')).toContain('pool');
    expect(minerRestartFieldsFor('solo-node')).not.toContain('nodeEnableSoloMining');
    expect(minerRestartFieldsFor('miner')).toContain('nodeEnableSoloMining');
  });
});

// What the settings page feeds restartPlanFor: the changed-field flags come from
// these lists, so a wallet edit is followed through them rather than asserted.
describe('a wallet change on a solo-node, from the page lists', () => {
  const before = { pool: { url: 'stratum+tcp://127.0.0.1:3333', username: 'bc1qold' }, nodeEnableSoloMining: true };
  const after = { ...before, pool: { ...before.pool, username: 'bc1qnew' } };
  const changed = (fields) => !isEqual(pick(before, fields), pick(after, fields));

  it('changes a miner field and no ckpool field', () => {
    expect(changed(minerRestartFieldsFor('solo-node'))).toBe(true);
    expect(changed(SOLO_RESTART_FIELDS)).toBe(false);
  });

  it('restarts the USB miner and leaves ckpool alone', () => {
    expect(
      restartPlanFor({
        deviceType: 'solo-node',
        minerFieldsChanged: changed(minerRestartFieldsFor('solo-node')),
        soloFieldsChanged: changed(SOLO_RESTART_FIELDS),
        nodeNeeded: false,
        minerService: { status: 'online' },
        soloService: { status: 'online' },
        hasUsbMiners: true,
      })
    ).toEqual({ type: 'miner', skipped: null });
  });
});

describe('savedMessageIdFor', () => {
  it('names the stopped service', () => {
    expect(savedMessageIdFor('miner')).toBe('settings.actions.saved_miner_stopped');
    expect(savedMessageIdFor('solo')).toBe('settings.actions.saved_solo_stopped');
  });

  it('leaves the plain toast alone otherwise', () => {
    expect(savedMessageIdFor(null)).toBeNull();
  });
});

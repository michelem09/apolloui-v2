import {
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

    // The miner and solo field lists overlap (pool): the wallet address is the
    // pool username, so one edit changes both, and a USB miner mines to it.
    describe('with a USB miner (monitor says online)', () => {
      const wallet = { ...solo, minerFieldsChanged: true };
      const usb = { status: 'online' };

      it('restarts ckpool, then the miner', () => {
        expect(restartPlanFor({ ...wallet, soloService: usb, minerService: usb })).toEqual({
          type: 'solo+miner',
          skipped: null,
        });
      });

      it('adds the node last when it needs a restart too', () => {
        expect(
          restartPlanFor({ ...wallet, nodeNeeded: true, soloService: usb, minerService: usb })
        ).toEqual({ type: 'solo+miner+node', skipped: null });
      });

      it('restarts only the miner when ckpool is stopped, and still says so', () => {
        expect(
          restartPlanFor({ ...wallet, soloService: { status: 'offline' }, minerService: usb })
        ).toEqual({ type: 'miner', skipped: 'solo' });
      });
    });

    describe('without a running USB miner', () => {
      const wallet = { ...solo, minerFieldsChanged: true };

      // Without one, apollo-miner.service loops in auto-restart: the monitor
      // reports pending (or offline between turns), never online.
      it.each([
        [{ status: 'offline' }],
        [{ status: 'pending', requestedStatus: 'online' }],
        [{ status: 'pending', requestedStatus: 'offline' }],
        [{ status: 'error' }],
        [undefined],
      ])('leaves the miner alone (%j) and restarts only ckpool, silently', (minerService) => {
        expect(
          restartPlanFor({ ...wallet, soloService: { status: 'online' }, minerService })
        ).toEqual({ type: 'solo', skipped: null });
      });
    });

    it('does not restart the miner for a ckpool-only change (difficulty, signature)', () => {
      expect(
        restartPlanFor({
          ...solo,
          minerFieldsChanged: false,
          soloService: { status: 'online' },
          minerService: { status: 'online' },
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

describe('savedMessageIdFor', () => {
  it('names the stopped service', () => {
    expect(savedMessageIdFor('miner')).toBe('settings.actions.saved_miner_stopped');
    expect(savedMessageIdFor('solo')).toBe('settings.actions.saved_solo_stopped');
  });

  it('leaves the plain toast alone otherwise', () => {
    expect(savedMessageIdFor(null)).toBeNull();
  });
});

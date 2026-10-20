import { settingsTabsFor } from './settingsTabs';

describe('settingsTabsFor', () => {
  it('Apollo: pools and miner', () => {
    expect(settingsTabsFor({ isSoloNode: false, hasMiner: true })).toEqual([
      'pools', 'miner', 'node', 'system', 'mqtt', 'logs', 'extra',
    ]);
  });

  it('Solo Node with no board: no miner tab, never pools', () => {
    expect(settingsTabsFor({ isSoloNode: true, hasMiner: false })).toEqual([
      'solo', 'node', 'system', 'mqtt', 'logs', 'extra',
    ]);
  });

  it('Solo Node with a board: miner right after solo, still no pools', () => {
    expect(settingsTabsFor({ isSoloNode: true, hasMiner: true })).toEqual([
      'solo', 'miner', 'node', 'system', 'mqtt', 'logs', 'extra',
    ]);
  });
});

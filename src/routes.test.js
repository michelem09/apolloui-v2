import { getRoutes } from './routes';

const paths = (config) => getRoutes(config).map((r) => r.path);

describe('getRoutes — miner menu', () => {
  it('shows the Miner menu when there is a miner', () => {
    expect(paths({ hasMiner: true })).toContain('/miner');
  });

  it('hides the Miner menu when there is none (a Solo Node with no board)', () => {
    expect(paths({ hasMiner: false })).not.toContain('/miner');
  });

  it('assumes a miner when called without arguments', () => {
    expect(paths()).toContain('/miner');
  });

  it('common routes are always present, with or without a miner', () => {
    for (const hasMiner of [true, false]) {
      expect(paths({ hasMiner })).toEqual(
        expect.arrayContaining(['/overview', '/solo-mining', '/node', '/system', '/settings'])
      );
    }
  });

  it('no miner hides the Automation menu too — there is nothing to schedule', () => {
    expect(paths({ hasMiner: true })).toContain('/automation');
    expect(paths({ hasMiner: false })).not.toContain('/automation');
  });

  it('having no miner removes exactly the miner-only routes (Miner and Automation)', () => {
    expect(paths({ hasMiner: false }).length).toBe(paths({ hasMiner: true }).length - 2);
  });
});

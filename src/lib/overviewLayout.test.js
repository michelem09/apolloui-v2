import { overviewAreasFor } from './overviewLayout';

// Every area name the grid is given must be placed by exactly one GridItem in the
// page, and a name used here that nothing renders leaves a hole in the grid.
const names = (template) =>
  [...new Set(template.replace(/'/g, ' ').split(/\s+/).filter(Boolean))];

const rowsOf = (template) => template.match(/'[^']+'/g);

describe('overviewAreasFor', () => {
  it('Apollo: miner cards and charts, no solo areas', () => {
    const a = overviewAreasFor({ isSoloNode: false, hasMiner: true, soloOnline: false });
    expect(names(a.lg).sort()).toEqual(
      ['chart', 'gauges', 'hashrate', 'node', 'power', 'temperatures'].sort()
    );
    expect(a.base).toBe(`'hashrate' 'temperatures' 'power' 'node' 'chart' 'gauges'`);
  });

  it('Solo Node without a miner: no miner areas', () => {
    const a = overviewAreasFor({ isSoloNode: true, hasMiner: false, soloOnline: true });
    expect(names(a.lg).sort()).toEqual(['gauges', 'node', 'soloChart']);
    expect(a.base).toBe(`'node' 'soloChart' 'gauges'`);
  });

  it('Solo Node without a miner, pool off: the panel sits beside the chart', () => {
    const a = overviewAreasFor({ isSoloNode: true, hasMiner: false, soloOnline: false });
    expect(rowsOf(a.lg)[1]).toBe(`'soloState soloChart soloChart soloChart'`);
    expect(a.base).toBe(`'node' 'soloState' 'soloChart' 'gauges'`);
  });

  it('Solo Node with a miner: miner row under the node widgets, solo chart kept', () => {
    const a = overviewAreasFor({ isSoloNode: true, hasMiner: true, soloOnline: true });
    expect(rowsOf(a.lg)).toEqual([
      `'node node node node'`,
      `'hashrate hashrate temperatures power'`,
      `'soloChart soloChart soloChart soloChart'`,
      `'gauges gauges gauges gauges'`,
    ]);
    expect(a.base).toBe(`'node' 'hashrate' 'temperatures' 'power' 'soloChart' 'gauges'`);
    // The miner charts belong to the Apollo layout only.
    expect(names(a.lg)).not.toContain('chart');
  });

  it('Solo Node with a miner, pool off: both the miner row and the solo panel', () => {
    const a = overviewAreasFor({ isSoloNode: true, hasMiner: true, soloOnline: false });
    expect(rowsOf(a.lg)[2]).toBe(`'soloState soloChart soloChart soloChart'`);
    expect(a.base).toBe(
      `'node' 'hashrate' 'temperatures' 'power' 'soloState' 'soloChart' 'gauges'`
    );
  });

  it('a Solo Node with a miner and an Apollo never share a template', () => {
    const solo = overviewAreasFor({ isSoloNode: true, hasMiner: true, soloOnline: true });
    const apollo = overviewAreasFor({ isSoloNode: false, hasMiner: true, soloOnline: true });
    expect(solo.lg).not.toBe(apollo.lg);
  });
});

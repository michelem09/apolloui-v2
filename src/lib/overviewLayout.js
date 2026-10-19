// Grid areas of the Overview, one layout per kind of box:
//
//   Apollo                  miner cards and the miner charts, node beside them
//   Solo Node, no miner     the node widgets, the solo chart
//   Solo Node with a miner  the Solo Node layout, with the miner's hashrate,
//                           temperature and power as a row under the node widgets
//
// The solo chart stays the chart of a Solo Node with a miner: what the USB board
// hashes is what the local pool sees, so a second history would draw the same line.
// Pulled out of the page so the three layouts can be asserted rather than read.

const ROW_NODE = `'node node node node'`;
const ROW_GAUGES = `'gauges gauges gauges gauges'`;
const ROW_MINER = `'hashrate hashrate temperatures power'`;
const ROW_SOLO = `'soloChart soloChart soloChart soloChart'`;
// While the pool is off its panel takes a quarter of the chart's row, on the left
// where the reading starts (stacked, it already comes first).
const ROW_SOLO_OFF = `'soloState soloChart soloChart soloChart'`;

const stack = (...areas) => areas.map((a) => `'${a}'`).join(' ');
const rows = (...r) => r.join(' ');

export const overviewAreasFor = ({ isSoloNode, hasMiner, soloOnline }) => {
  if (!isSoloNode) {
    const lg = rows(
      `'hashrate hashrate temperatures power'`,
      `'hashrate hashrate node node'`,
      `'chart chart chart chart'`,
      ROW_GAUGES
    );
    return {
      base: stack('hashrate', 'temperatures', 'power', 'node', 'chart', 'gauges'),
      lg,
      '3xl': lg,
    };
  }

  const soloRow = soloOnline ? ROW_SOLO : ROW_SOLO_OFF;
  const lg = hasMiner
    ? rows(ROW_NODE, ROW_MINER, soloRow, ROW_GAUGES)
    : rows(ROW_NODE, soloRow, ROW_GAUGES);
  const base = stack(
    'node',
    ...(hasMiner ? ['hashrate', 'temperatures', 'power'] : []),
    ...(soloOnline ? [] : ['soloState']),
    'soloChart',
    'gauges'
  );
  return { base, lg, '3xl': lg };
};

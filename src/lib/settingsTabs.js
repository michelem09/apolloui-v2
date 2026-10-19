// The Settings tabs, in order. A Solo Node mines only into its own node, so it
// never gets Pools; its Miner tab exists only while a board is plugged in. The
// route (`/settings/<name>`) and the tab index are both derived from this list,
// so the two cannot disagree.
export const settingsTabsFor = ({ isSoloNode, hasMiner }) =>
  isSoloNode
    ? ['solo', ...(hasMiner ? ['miner'] : []), 'node', 'system', 'logs', 'extra']
    : ['pools', 'miner', 'node', 'system', 'logs', 'extra'];

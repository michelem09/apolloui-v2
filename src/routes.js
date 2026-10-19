import { AppsIcon } from './components/UI/Icons/AppsIcon';
import { DashboardIcon } from './components/UI/Icons/DashboardIcon';
import { MinerIcon } from './components/UI/Icons/MinerIcon';
import { NodeIcon } from './components/UI/Icons/NodeIcon';
import { SettingsIcon } from './components/UI/Icons/SettingsIcon';
import { SystemIcon } from './components/UI/Icons/SystemIcon';
import { GrUserWorker } from 'react-icons/gr';
import { FormattedMessage } from 'react-intl';

// Function to generate the menu. `hasMiner` comes live from the device config:
// always true on an Apollo, and on a Solo Node only while a board is plugged in.
export const getRoutes = ({ hasMiner = true } = {}) => {
  return [
    {
      name: <FormattedMessage id="routes.overview" />,
      layout: '/admin',
      path: '/overview',
      icon: <DashboardIcon width='20px' height='20px' color='inherit' />,
    },
    // No miner, no Miner page
    ...(hasMiner ? [{
      name: <FormattedMessage id="routes.miner" />,
      layout: '/admin',
      path: '/miner',
      icon: <MinerIcon width='20px' height='20px' color='inherit' />,
    }] : []),
    {
      name: <FormattedMessage id="routes.soloMining" />,
      layout: '/admin',
      path: '/solo-mining',
      children: true,
      icon: <GrUserWorker size='1.2em' color='inherit' />,
    },
    {
      name: <FormattedMessage id="routes.node" />,
      layout: '/admin',
      icon: <NodeIcon width='20px' height='20px' color='inherit' />,
      path: '/node',
    },
    {
      name: <FormattedMessage id="routes.system" />,
      layout: '/admin',
      path: '/system',
      bottom: true,
      icon: <SystemIcon width='20px' height='20px' color='inherit' />,
    },
    {
      name: <FormattedMessage id="routes.settings" />,
      layout: '/admin',
      path: '/settings',
      bottom: true,
      icon: <SettingsIcon width='20px' height='20px' color='inherit' />,
    },
  ];
};

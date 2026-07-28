import React from 'react';
import { Box, Divider, useColorModeValue } from '@chakra-ui/react';
import { useIntl } from 'react-intl';
import { MdHistory } from 'react-icons/md';
import LogsViewer from '../../logs/LogsViewer';
import DiagnosticBundle from '../../logs/DiagnosticBundle';
import PanelCard from '../../UI/PanelCard';

const LogsTab = () => {
  const intl = useIntl();
  const textColor = useColorModeValue('brands.900', 'white');

  return (
    <PanelCard
      title={intl.formatMessage({ id: 'settings.sections.system.logs.title' })}
      description={intl.formatMessage({ id: 'settings.sections.system.logs.description' })}
      textColor={textColor}
      icon={MdHistory}
    >
      <Box p="22px">
        <LogsViewer height="calc(100vh - 460px)" />
        <Divider my={5} />
        <DiagnosticBundle />
      </Box>
    </PanelCard>
  );
};

export default LogsTab; 
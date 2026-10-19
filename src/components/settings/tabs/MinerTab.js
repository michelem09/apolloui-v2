import React from 'react';
import { Alert, AlertIcon, AlertDescription, Box, Grid, GridItem } from '@chakra-ui/react';
import { useIntl } from 'react-intl';
import { useDeviceConfig } from '../../../contexts/DeviceConfigContext';
import MinerModeSettings from '../sections/MinerModeSettings';
import FanSettings from '../sections/FanSettings';
import PowerLedSettings from '../sections/PowerLedSettings';

const MinerTab = () => {
  const intl = useIntl();
  // An Apollo III with USB boards: the III has presets of its own, the USB boards
  // can only follow the legacy mode that matches, and the page would otherwise
  // look as if its presets governed everything that is mining.
  const { isHybrid } = useDeviceConfig();

  return (
    <>
      {isHybrid && (
        <Box mb="20px">
          <Alert status="info" borderRadius="10px" data-testid="usb-legacy-note">
            <AlertIcon />
            <AlertDescription>
              {intl.formatMessage({ id: 'settings.sections.miner.usb_legacy_note' })}
            </AlertDescription>
          </Alert>
        </Box>
      )}
      <Grid
        templateColumns={{
          base: 'repeat(1, 1fr)',
          md: 'repeat(2, 1fr)',
        }}
        gap="20px"
        mb="20px"
      >
        <GridItem>
          <MinerModeSettings />
        </GridItem>
        <GridItem>
          <FanSettings />
          <PowerLedSettings />
        </GridItem>
      </Grid>
    </>
  );
};

export default MinerTab;

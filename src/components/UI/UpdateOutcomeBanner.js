import {
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Box,
  CloseButton,
} from '@chakra-ui/react';
import { useIntl } from 'react-intl';

// Tells the user what the update they started actually did.
//
// Without it, the most valuable thing this mechanism does is invisible: the
// updater stops apollo-api, the UI shows "backend offline" for a few minutes,
// and then everything comes back. A successful update, a failed one that was
// automatically rolled back, and a random crash all look exactly the same from
// the sofa. A rollback in particular is the difference between "your device
// recovered itself" and "re-flash it", and it deserves to be said out loud.
//
// Persistent, not a toast: the update window is minutes long and nobody is
// watching the screen for it.
const STATUS = {
  success: { scheme: 'green', key: 'success' },
  'rolled-back': { scheme: 'orange', key: 'rolled_back' },
  failed: { scheme: 'red', key: 'failed' },
};

const UpdateOutcomeBanner = ({ outcome, onDismiss }) => {
  const intl = useIntl();
  if (!outcome?.result) return null;

  const status = STATUS[outcome.result] || STATUS.failed;
  const t = (id, values) =>
    intl.formatMessage({ id: `update_outcome.${id}` }, values);

  return (
    <Alert
      status={outcome.result === 'success' ? 'success' : 'warning'}
      colorScheme={status.scheme}
      variant="left-accent"
      borderRadius="md"
      mb={4}
      alignItems="flex-start"
    >
      <AlertIcon />
      <Box flex="1">
        <AlertTitle>
          {t(`${status.key}_title`, { version: outcome.to || '' })}
        </AlertTitle>
        <AlertDescription display="block" fontSize="sm">
          {t(`${status.key}_description`, {
            from: outcome.from || '',
            to: outcome.to || '',
          })}
          {/* The reason is the updater's own message, so it is not translated —
              showing it verbatim is what makes a support conversation possible. */}
          {outcome.reason ? ` — ${outcome.reason}` : ''}
        </AlertDescription>
      </Box>
      <CloseButton
        onClick={onDismiss}
        position="relative"
        right={-1}
        top={-1}
      />
    </Alert>
  );
};

export default UpdateOutcomeBanner;

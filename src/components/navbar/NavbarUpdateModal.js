// Chakra Imports
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalCloseButton,
  Text,
  Button,
  ModalBody,
} from '@chakra-ui/react';
import { useLazyQuery, useQuery } from '@apollo/client';
import { MCU_UPDATE_STATUS_QUERY, MCU_UPDATE_QUERY } from '../../graphql/mcu';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateStarted } from '../../redux/slices/updateSlice';

const NavbarUpdateModal = ({
  isOpen,
  onClose,
  localVersion,
  remoteVersion,
}) => {
  const dispatch = useDispatch();
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [handleUpdate, { error: errorUpdate, data: dataUpdate }] = useLazyQuery(
    MCU_UPDATE_QUERY,
    { fetchPolicy: 'no-cache' }
  );

  // Polled only while this modal is following an update it started. It used to
  // run unconditionally at mount, so the value left by the PREVIOUS run was
  // already in the cache when the gate opened — the effect read it immediately
  // and declared "Done!" seconds after the tarball began downloading.
  const {
    data: dataStatus,
    startPolling: startPollingProgress,
    stopPolling: stopPollingProgress,
    refetch: refetchStatus,
  } = useQuery(MCU_UPDATE_STATUS_QUERY, {
    skip: !updateInProgress,
    fetchPolicy: 'network-only',
  });

  const startUpdate = async () => {
    // Read the run id that is there NOW, before anything starts. Our outcome is
    // the first record carrying a different one — which is how this recognises
    // its own update without comparing the browser's clock to the device's.
    let previousRunId = null;
    try {
      const { data } = await refetchStatus();
      previousRunId = data?.Mcu?.updateStatus?.result?.record?.runId ?? null;
    } catch (err) {
      // No record, or unreachable: any run id we then see is necessarily new.
    }
    handleUpdate();
    setUpdateInProgress(true);
    // Also recorded in redux, which is persisted: the updater stops apollo-api,
    // so this component is about to be unmounted with the whole layout. Without
    // this the browser forgets it ever started an update and comes back to an
    // unexplained "backend offline".
    dispatch(updateStarted({ targetVersion: remoteVersion, previousRunId }));
    startPollingProgress(3000);
  };

  const record = dataStatus?.Mcu?.updateStatus?.result?.record;
  const remoteProgress = record?.progress ?? 0;

  useEffect(() => {
    if (errorUpdate) {
      setUpdateError(errorUpdate.message || 'An error occurred during the update process');
      setUpdateInProgress(false);
      stopPollingProgress();
      setProgress(0);
    }
  }, [errorUpdate, stopPollingProgress]);

  useEffect(() => {
    // Only an update WE are following. Reporting what a past one did is the
    // outcome banner's job — this modal reading leftovers is what once replaced
    // the Update button with "Reload App" and left the device unable to take
    // another update at all.
    if (!updateInProgress) return;

    setProgress(remoteProgress);

    if (!record || record.state === 'running') return;

    // Anything that is not "succeeded" is a failure the user has to be told
    // about, and the record says which kind — including the one that means the
    // device could NOT be put back.
    if (record.state !== 'succeeded') {
      stopPollingProgress();
      setUpdateInProgress(false);
      setProgress(0);
      setUpdateError(
        record.state === 'recovery-failed'
          ? 'The update failed and the previous version could not be restored. This device needs attention.'
          : 'The update failed. The previous version is still installed and running.'
      );
      return;
    }

    // The device says it succeeded — not a number this client interprets. A
    // threshold could be crossed while two gates that still roll everything back
    // were pending, which told the user it had worked while it was reverting.
    {
      stopPollingProgress();
      setUpdateInProgress(false);
      setProgress(0);
      setTimeout(() => {
        setDone(true);
      }, 5000);
    }
  }, [updateInProgress, record, remoteProgress, stopPollingProgress]);

  const handleReloadApp = () => {
    return () => {
      window.location.reload();
    };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (updateInProgress) {
          // Show warning that update is in progress
          return;
        }
        onClose();
      }}
      size={{ base: 'sm', md: '4xl' }}
      closeOnOverlayClick={false}
      closeOnEsc={false}
      onCloseComplete={() => {
        setDone(false);
        setUpdateError(null);
      }}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {localVersion === remoteVersion
            ? `Your app is updated to the latest version v${localVersion}`
            : `New version v${remoteVersion} is available!`}
        </ModalHeader>
        <ModalBody>
          <Text>
            {localVersion === remoteVersion
              ? 'You are using the latest version of the app.'
              : 'Please update to the latest version of the app to get the latest features and bug fixes. The update downloads a verified package and usually takes a few minutes. Mining and your Bitcoin node stop briefly while it is applied. Do NOT power off the system during the update.'}
          </Text>
          {updateInProgress && <Text>Updating... {progress}%</Text>}
          {done && !updateInProgress && <Text>Done!</Text>}
          {updateError && (
            <Text color="red.500" mt={2}>
              Error: {updateError}
            </Text>
          )}
        </ModalBody>
        {!done && !updateInProgress && <ModalCloseButton />}
        <ModalFooter>
          {localVersion !== remoteVersion && !done && !updateError && (
            <Button
              colorScheme="blue"
              mr={3}
              onClick={() => startUpdate()}
              isDisabled={updateInProgress}
              isLoading={updateInProgress}
            >
              Update
            </Button>
          )}
          {!done && !updateInProgress && (
            <Button variant="ghost" onClick={onClose}>
              {localVersion === remoteVersion ? 'Close' : 'Cancel'}
            </Button>
          )}
          {done && (
            <Button colorScheme="orange" onClick={handleReloadApp()}>
              Reload App
            </Button>
          )}
          {updateError && (
            <Button colorScheme="red" onClick={() => setUpdateError(null)}>
              Try Again
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default NavbarUpdateModal;

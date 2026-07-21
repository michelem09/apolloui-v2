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
import { MCU_UPDATE_PROGRESS_QUERY, MCU_UPDATE_QUERY } from '../../graphql/mcu';
import { useEffect, useState } from 'react';

const NavbarUpdateModal = ({
  isOpen,
  onClose,
  localVersion,
  remoteVersion,
}) => {
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [handleUpdate, { error: errorUpdate, data: dataUpdate }] = useLazyQuery(
    MCU_UPDATE_QUERY,
    { fetchPolicy: 'no-cache' }
  );

  const {
    data: dataProgress,
    startPolling: startPollingProgress,
    stopPolling: stopPollingProgress,
  } = useQuery(MCU_UPDATE_PROGRESS_QUERY);

  const startUpdate = () => {
    handleUpdate();
    setUpdateInProgress(true);
    startPollingProgress(3000);
  };

  const { value: remoteProgress } =
    dataProgress?.Mcu?.updateProgress?.result || {};

  useEffect(() => {
    if (errorUpdate) {
      setUpdateError(errorUpdate.message || 'An error occurred during the update process');
      setUpdateInProgress(false);
      stopPollingProgress();
      setProgress(0);
    }
  }, [errorUpdate, stopPollingProgress]);

  useEffect(() => {
    if (updateInProgress) {
      setProgress(remoteProgress);
    }

    // The updater writes -1 when it gives up. Without this the modal stayed at
    // "Updating... 0%" forever, with the close button hidden, because a failed
    // update and a just-started one looked identical from here.
    if (remoteProgress < 0) {
      stopPollingProgress();
      setUpdateInProgress(false);
      setProgress(0);
      setUpdateError(
        'The update failed. The previous version is still installed and running.'
      );
      return;
    }

    if (remoteProgress >= 90) {
      stopPollingProgress();
      setUpdateInProgress(false);
      setProgress(0);
      setTimeout(() => {
        setDone(true);
      }, 5000);
    }
  }, [updateInProgress, remoteProgress, stopPollingProgress]);

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

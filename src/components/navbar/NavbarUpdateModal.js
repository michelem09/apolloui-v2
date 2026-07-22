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
import { useIntl } from 'react-intl';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  updateStarted,
  updateRunObserved,
} from '../../redux/slices/updateSlice';
import {
  classifyUpdate,
  canStartUpdate,
  RUNNING,
  WAITING,
  ABANDONED,
} from '../../lib/updateOutcome';

const NavbarUpdateModal = ({
  isOpen,
  onClose,
  localVersion,
  remoteVersion,
  // Decided once, with semver ordering, by whoever owns both numbers. Recomputing
  // it here as `localVersion !== remoteVersion` offered updates the updater then
  // refused — every difference looked like a newer version, including older ones.
  updateAvailable,
  // The channel could not be reached, so we do not know whether an update
  // exists. Saying "you are up to date" here would be a claim we cannot make.
  channelUnreachable,
}) => {
  const intl = useIntl();
  // Every user-visible string goes through here. CLAUDE.md §9: locales in all
  // four files. This modal shipped hardcoded English while the banner and the
  // offline screen beside it were translated — so a de/it/es user got a
  // translated banner and an English-only modal describing the same failure,
  // including the one that says the device needs attention.
  const t = (id, values) => intl.formatMessage({ id: `update_modal.${id}` }, values);
  const dispatch = useDispatch();
  // Shared with the layout, deliberately: these two follow the same run, and
  // when each kept its own copy of what it had seen they reached opposite
  // conclusions from the same device answer.
  const { previousRunId, seenRunning, startedAt } = useSelector(
    (state) => state.update,
    shallowEqual
  );
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
    let startingPoint;
    try {
      const { data } = await refetchStatus();
      startingPoint = data?.Mcu?.updateStatus?.result;
    } catch (err) {
      // We could not read the device's state, so we cannot know what a run id we
      // see later would mean. Treating that as "no previous run" is the mistake
      // that made the client accept a stale record as its own outcome: on any
      // device that has updated before, the leftover run id is NOT new.
      setUpdateError(t('unreachable_start'));
      return;
    }

    // Refuse to stack a second run on a live one. systemd-run would reject the
    // duplicate unit name and exit before installing the trap that records why,
    // and this client would have captured the IN-FLIGHT run's id as "previous" —
    // permanently unable to recognise that run's own outcome, including
    // recovery-failed, the one that means someone has to SSH in.
    if (!canStartUpdate(startingPoint ?? {})) {
      setUpdateError(t('already_running'));
      return;
    }

    const capturedRunId = startingPoint?.record?.runId ?? null;
    handleUpdate();
    setUpdateInProgress(true);
    // Also recorded in redux, which is persisted: the updater stops apollo-api,
    // so this component is about to be unmounted with the whole layout. Without
    // this the browser forgets it ever started an update and comes back to an
    // unexplained "backend offline".
    dispatch(
      updateStarted({
        targetVersion: remoteVersion,
        previousRunId: capturedRunId,
      })
    );
    startPollingProgress(3000);
  };

  const status = dataStatus?.Mcu?.updateStatus?.result;
  const record = status?.record;

  useEffect(() => {
    if (errorUpdate) {
      setUpdateError(errorUpdate.message || t('generic_error'));
      setUpdateInProgress(false);
      stopPollingProgress();
      setProgress(0);
    }
  }, [errorUpdate, stopPollingProgress]);

  useEffect(() => {
    // Only an update WE are following, and only once the device shows something
    // that is actually ours. Branching on `record.state` alone — which this did
    // — reads the PREVIOUS run's terminal record, because the updater needs
    // 150-500 ms to clear sudo, the preamble and systemd-run and reach its first
    // write_state, while this query fires the instant its skip gate opens. The
    // result was "Done!" and a Reload App button a moment after the click, on
    // top of a swap that had not begun.
    if (!updateInProgress) return;

    const outcome = classifyUpdate({
      running: Boolean(status?.running),
      record,
      previousRunId,
      seenRunning,
      elapsedMs: startedAt ? Date.now() - new Date(startedAt).getTime() : 0,
    });

    if (outcome.seenRunning && !seenRunning) dispatch(updateRunObserved());

    if (outcome.kind === RUNNING) {
      // Only our own record's progress. The previous run's number would jump the
      // bar to 100 before anything had happened.
      if (record?.runId && record.runId !== previousRunId) {
        setProgress(record.progress ?? 0);
      }
      return;
    }

    if (outcome.kind === WAITING) return;

    stopPollingProgress();
    setUpdateInProgress(false);
    setProgress(0);

    // Gone without recording anything. The likeliest cause is the first OTA on a
    // device that has no jq yet: write_state cannot write until the dependency
    // install has succeeded, so a failure there leaves nothing behind at all.
    if (outcome.kind === ABANDONED) {
      setUpdateError(t('no_result'));
      return;
    }

    // Anything that is not "succeeded" is a failure the user has to be told
    // about, and the record says which kind — including the one that means the
    // device could NOT be put back.
    if (outcome.record.state !== 'succeeded') {
      setUpdateError(
        outcome.record.state === 'recovery-failed'
          ? t('failed_recovery')
          : t('failed_generic')
      );
      return;
    }

    // The device says it succeeded — not a number this client interprets. A
    // threshold could be crossed while two gates that still roll everything back
    // were pending, which told the user it had worked while it was reverting.
    setTimeout(() => {
      setDone(true);
    }, 5000);
  }, [
    updateInProgress,
    status,
    record,
    previousRunId,
    seenRunning,
    startedAt,
    stopPollingProgress,
    dispatch,
  ]);

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
          {updateAvailable
            ? t('title_available', { version: remoteVersion })
            : channelUnreachable
              ? t('title_unreachable', { version: localVersion })
              : t('title_current', { version: localVersion })}
        </ModalHeader>
        <ModalBody>
          <Text>
            {channelUnreachable
              ? t('body_unreachable')
              : !updateAvailable
              ? t('body_current')
              : t('body_available')}
          </Text>
          {updateInProgress && <Text>{t('progress', { progress })}</Text>}
          {done && !updateInProgress && <Text>{t('done')}</Text>}
          {updateError && (
            <Text color="red.500" mt={2}>
              {t('error_prefix', { message: updateError })}
            </Text>
          )}
        </ModalBody>
        {!done && !updateInProgress && <ModalCloseButton />}
        <ModalFooter>
          {updateAvailable && !done && !updateError && (
            <Button
              colorScheme="blue"
              mr={3}
              onClick={() => startUpdate()}
              isDisabled={updateInProgress}
              isLoading={updateInProgress}
            >
              {t('update')}
            </Button>
          )}
          {!done && !updateInProgress && (
            <Button variant="ghost" onClick={onClose}>
              {updateAvailable ? t('cancel') : t('close')}
            </Button>
          )}
          {done && (
            <Button colorScheme="orange" onClick={handleReloadApp()}>
              {t('reload')}
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

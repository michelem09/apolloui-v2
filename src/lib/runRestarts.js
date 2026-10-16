import { callFailure, serviceFailureIdOf } from './callFailure';
import { sendFeedback } from '../redux/slices/feedbackSlice';

// The restart a Settings save asks for. On v2.2 only the miner is restarted from
// here: the backend applies node and solo (ckpool) changes itself when the
// settings are saved (settings._applyServiceLifecycle), so asking for those as
// well would restart the same service twice.
//
// Says nothing for a restart that was accepted: its progress and its arrival are
// announced by StatusTransitionFeedback from the service status, and a
// "Restarting ..." of our own on top of "Starting ..." is the same news twice.
// A refused one is reported (in the user's language when the backend says which
// service action it was), since the status never shows that.
//
// Returns true when the restart that was asked for went through (or none was).
export const runRestarts = async ({ type, restartMiner, dispatch }) => {
  if (type !== 'miner' && type !== 'both') return true;
  const result = await restartMiner();
  const failure = callFailure(result);
  if (!failure) return true;
  dispatch(sendFeedback({ message: failure, messageId: serviceFailureIdOf(result), type: 'error' }));
  return false;
};

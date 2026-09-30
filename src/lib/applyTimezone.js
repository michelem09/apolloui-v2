// Applying the system timezone, as part of saving settings.
//
// Same rule as savePendingPools next door, and for the same reason: by the time
// this runs the settings and pools are already persisted, and the restarts that
// make them take effect on the miner still have to happen. A zone the device
// refuses, or a request that never lands, must not cost the user those restarts.
//
// So this never throws. It returns the messages to show, and the caller carries
// on whatever happened here.

export const applyTimezone = async ({ wanted, current, setTimezone, refetch }) => {
  const feedback = [];

  if (!wanted || wanted === current) return feedback;

  try {
    const result = await setTimezone({ variables: { input: { timezone: wanted } } });
    const error = result?.data?.Mcu?.setTimezone?.error;

    if (error) {
      feedback.push({ message: error.message, type: 'error' });
      return feedback;
    }

    // Only on success: the panel reads the "a restart is still owed" flag from
    // this query, and refetching after a refusal would just re-read the old zone.
    if (refetch) await refetch();
  } catch (error) {
    feedback.push({ message: error.message, type: 'error' });
  }

  return feedback;
};

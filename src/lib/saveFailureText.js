// The text for a failed Settings save. A refusal the backend words (a service
// restart systemd refused) is shown in the user's language; and when it came from
// the settings step it also says the settings were NOT saved, because on v2.2 the
// backend rolls the row back when applying it fails.
//
// `saved` is the failed result of runSteps; `formatMessage` is intl's.
export const saveFailureText = (saved, formatMessage) => {
  if (!saved.messageId) return saved.message;
  const reason = formatMessage({ id: saved.messageId, defaultMessage: saved.message });
  return saved.step === 'settings'
    ? formatMessage({ id: 'settings.not_saved_reason' }, { reason })
    : reason;
};

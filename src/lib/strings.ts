/**
 * Every user-facing string in the app.
 *
 * English for now. When the building wants Danish, this is the only file that
 * needs translating — no i18n framework, just one pass through here. Keep it
 * that way: no user-visible text anywhere else.
 *
 * Messages that come back from the database (rule violations) are shown as-is;
 * they are written in the migrations and would need translating there too.
 */

export const strings = {
  appName: 'Laundry',

  common: {
    cancel: 'Cancel',
    close: 'Close',
    loading: 'Loading…',
    retry: 'Try again',
    signOut: 'Sign out',
    somethingWentWrong: 'Something went wrong. Try again.',
  },

  nav: {
    book: 'Book',
    history: 'History',
    admin: 'Admin',
  },

  signIn: {
    title: 'Laundry room',
    intro: 'Book the laundry room for your apartment.',
    emailLabel: 'Your email',
    emailPlaceholder: 'you@example.com',
    submit: 'Send me a login link',
    sending: 'Sending…',
    sent: (email: string) =>
      `Check your inbox. We sent a login link to ${email}. It works once and expires after an hour.`,
    sendAgain: 'Use a different email',
    invalidEmail: 'Enter an email address.',
  },

  claimApartment: {
    title: 'Which apartment are you?',
    intro:
      'Your apartment number is your identity here. Everyone in the building can see which apartment booked which slot.',
    numberLabel: 'Apartment number',
    submit: 'That is my apartment',
    saving: 'Saving…',
    invalidNumber: 'Enter your apartment number.',
    wrongAccount: 'Signed in as {email}. Not you?',
  },

  grid: {
    title: 'Laundry room',
    subtitle: (apartmentNumber: number) => `You are apartment ${apartmentNumber}`,
    free: 'Free',
    apartment: (number: number) => `Apt ${number}`,
    yours: 'You',
    finished: 'Over',
    inProgress: 'Now',
    claimable: 'Claimable',
    today: 'Today',
    tomorrow: 'Tomorrow',
    horizonNote: (days: number) => `You can book up to ${days} days ahead.`,
    legendFree: 'Free',
    legendYours: 'Yours',
    legendTaken: 'Booked',
    legendClaimable: 'Claimable',
    booking: 'Booking…',
    slotOver: 'That slot is over.',
    takenBy: (number: number) => `Apartment ${number} has booked this slot.`,
    inGraceWindow:
      'This slot is taken. If no wash is running, it can be claimed 30 minutes after it starts.',
    alreadyHaveFutureBooking:
      'You already have a booking coming up. Cancel it before booking another.',
    beyondHorizon: (days: number) => `You can only book up to ${days} days ahead.`,
  },

  confirm: {
    cancelTitle: 'Cancel this booking?',
    cancelBody: (slot: string, day: string) =>
      `${day}, ${slot}. The slot becomes free for someone else.`,
    cancelConfirm: 'Cancel the booking',
    cancelKeep: 'Keep it',

    releaseTitle: 'Release this slot?',
    releaseBody: (slot: string, day: string) =>
      `${day}, ${slot}. The slot has started, so it stays in the record as released by you. Someone else can use the rest of the period.`,
    releaseConfirm: 'Release the slot',
    releaseKeep: 'Keep it',
  },

  /**
   * Deliberate wording — do not soften it. The app cannot see the machines, so
   * the only thing standing between a claim and a stolen wash is the person
   * reading this.
   */
  claimDialog: {
    title: 'Take this slot?',
    body: (apartmentNumber: number) =>
      [
        `This slot belongs to apartment ${apartmentNumber}, and 30 minutes have passed since it started.`,
        'If you are in the laundry room and can see that no wash is running, you can take the slot for the rest of the period.',
        'The app cannot see whether the machines are running. Only claim this if you have actually checked. Your claim is recorded and visible to everyone in the building.',
      ] as const,
    cancel: 'Cancel',
    confirm: 'I have checked — claim the slot',
    claiming: 'Claiming…',
  },

  history: {
    title: 'History',

    lastWashTitle: 'Last wash by apartment',
    lastWashIntro:
      'Oldest first, so apartments that have not washed for a long time are at the top.',
    lastWashNever: 'No wash on record',

    logTitle: 'Log',
    logIntro: 'Everything from the last 60 days, newest first.',
    logEmpty: 'Nothing in the last 60 days.',
    logRetention: (days: number) =>
      `Nothing is ever deleted. This page shows the last ${days} days.`,

    statusActive: 'booked',
    statusCancelled: 'cancelled',
    statusReleased: 'released',
    statusTakenOver: 'taken over',

    /** e.g. "Apt 14 — taken over by apt 7 at 07:45" */
    logTakenOver: (apartmentNumber: number, byNumber: number, atTime: string) =>
      `Apt ${apartmentNumber} — taken over by apt ${byNumber} at ${atTime}`,
    logCancelled: (apartmentNumber: number) => `Apt ${apartmentNumber} — cancelled`,
    logReleased: (apartmentNumber: number, atTime: string) =>
      `Apt ${apartmentNumber} — released at ${atTime}`,
    logClaimed: (apartmentNumber: number, fromNumber: number) =>
      `Apt ${apartmentNumber} — claimed from apt ${fromNumber}`,
    logBooked: (apartmentNumber: number) => `Apt ${apartmentNumber}`,
  },

  admin: {
    title: 'Admin',
    intro: 'Only for whoever looks after the building.',

    reassignTitle: 'Move an apartment to a different account',
    reassignIntro:
      'Use this when a resident moves out and a new one moves in, or when someone claimed the wrong number. Bookings already in the record keep the apartment they were made by.',
    reassignApartmentLabel: 'Apartment number',
    reassignEmailLabel: 'Email of the account to link',
    reassignSubmit: 'Move apartment',
    reassignDone: (number: number, email: string) => `Apartment ${number} is now linked to ${email}.`,
    reassignUnlinkSubmit: 'Unlink this apartment',
    reassignUnlinkDone: (number: number) =>
      `Apartment ${number} is no longer linked to an account. Anyone can claim it.`,

    removeTitle: 'Remove an account',
    removeIntro:
      'Deletes the login. The apartment stays, and so does every booking ever made from it.',
    removeEmailLabel: 'Email of the account to remove',
    removeSubmit: 'Remove account',
    removeConfirm: (email: string) => `Remove the account ${email}? This cannot be undone.`,
    removeDone: (email: string) => `Removed ${email}.`,

    noAccount: 'No account with that email.',
  },
} as const

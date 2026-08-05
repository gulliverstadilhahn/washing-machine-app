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
    loading: 'Loading…',
    signOut: 'Sign out',
    somethingWentWrong: 'Something went wrong. Try again.',
  },

  nav: {
    book: 'Book',
    myPage: 'My page',
    history: 'History',
    admin: 'Admin',
  },

  login: {
    title: 'Laundry room',
    intro: 'Book the laundry room for your apartment.',

    numberLabel: 'Apartment number',
    continue: 'Continue',
    checking: 'Checking…',
    invalidNumber: 'Enter your apartment number.',
    changeNumber: 'Not your apartment?',

    signupIntro: (number: number) =>
      `Apartment ${number} hasn't been claimed yet. Set a password to claim it.`,
    nameLabel: 'Your name',
    phoneLabel: 'Your phone number',
    createPasswordLabel: 'Choose a password',
    confirmPasswordLabel: 'Confirm password',
    signupSubmit: 'Create account',
    signupSaving: 'Creating…',
    invalidPassword: 'Choose a password with at least 6 characters.',
    passwordMismatch: 'Passwords do not match.',

    loginIntro: (number: number) => `Welcome back, apartment ${number}.`,
    passwordLabel: 'Password',
    loginSubmit: 'Log in',
    loginSaving: 'Logging in…',
    wrongPassword: (number: number) =>
      `Wrong password. If you've forgotten it, ask the admin to reset apartment ${number}.`,
    forgotPassword: (number: number) =>
      `Forgotten your password? Ask the admin to reset apartment ${number}.`,
  },

  claimApartment: {
    title: 'Which apartment are you?',
    intro:
      'Everyone in the building can see which apartment booked which slot, and your name and phone number so they can reach you about a booking.',
    numberLabel: 'Apartment number',
    nameLabel: 'Your name',
    phoneLabel: 'Your phone number',
    submit: 'That is my apartment',
    saving: 'Saving…',
    invalidNumber: 'Enter your apartment number.',
    invalidName: 'Enter your name.',
    invalidPhone: 'Enter your phone number.',
    wrongAccount: 'Not your apartment?',
  },

  grid: {
    title: 'Laundry room',
    subtitle: (apartmentNumber: number) => `You are apartment ${apartmentNumber}`,
    free: 'Free',
    apartment: (number: number) => `Apt ${number}`,
    yours: 'You',
    claimable: 'Claimable',
    today: 'Today',
    tomorrow: 'Tomorrow',
    horizonNote: (days: number) => `You can book up to ${days} days ahead.`,
    legendFree: 'Free',
    legendYours: 'Yours',
    legendTaken: 'Booked',
    legendClaimable: 'Claimable',

    contactLink: 'Contact',

    actionBook: 'Book this slot',
    actionBooking: 'Booking…',
    actionCancel: 'Cancel booking',
    actionRelease: 'Release slot',
    actionClaim: 'Claim this slot',

    slotOver: 'This slot is over.',
    takenBy: (number: number) => `Apartment ${number} has this slot.`,
    inGraceWindow: (time: string) =>
      `This slot is taken. If no wash is running, it can be claimed at ${time}.`,
    protectedUntil: (time: string) =>
      `This slot is yours until ${time}. After that, if no wash is running, it can be claimed.`,
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

    resetTitle: 'Reset an apartment',
    resetIntro:
      'Use this when a resident moves out, someone claimed the wrong number, or a password is forgotten. It clears the login and the contact details, so the apartment can be claimed again — by the new resident, or the same one with a new password. Bookings already in the record keep the apartment they were made by.',
    resetApartmentLabel: 'Apartment number',
    resetSubmit: 'Reset apartment',
    resetConfirm: (number: number) =>
      `Reset apartment ${number}? Its login and contact details will be cleared, and it can be claimed again. This cannot be undone.`,
    resetDone: (number: number) => `Apartment ${number} has been reset and can be claimed again.`,
  },

  contactDialog: {
    title: (apartmentNumber: number) => `Contact apartment ${apartmentNumber}`,
    close: 'Close',
  },

  myPage: {
    title: 'My page',
    subtitle: (apartmentNumber: number) => `Apartment ${apartmentNumber}`,

    detailsTitle: 'Your contact details',
    detailsIntro: 'Visible to everyone in the building, so they can reach you about a booking.',
    nameLabel: 'Your name',
    phoneLabel: 'Your phone number',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',

    bookingsTitle: 'Your bookings',
    bookingsEmpty: 'You have no bookings yet.',
  },
} as const

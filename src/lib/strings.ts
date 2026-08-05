/**
 * Every user-facing string in the app.
 *
 * In Danish — the building's residents are Danish, so this whole file was
 * translated in one pass, exactly as the original design intended ("keep all
 * user-facing strings in one file so it can be translated to Danish in one
 * pass"). Comments and key names stay in English for the codebase; only the
 * values are Danish.
 *
 * Messages that come back from the database (rule violations) are shown as-is
 * — they are written in the migrations (in Danish too, see
 * `supabase/migrations/20260805090800_danish_messages.sql`) and would need
 * translating there if that ever changes.
 */

export const strings = {
  appName: 'Vaskerummet',

  common: {
    cancel: 'Annuller',
    loading: 'Indlæser…',
    signOut: 'Log ud',
    somethingWentWrong: 'Der gik noget galt. Prøv igen.',
  },

  nav: {
    book: 'Book',
    myPage: 'Min side',
    history: 'Historik',
    admin: 'Admin',
  },

  login: {
    title: 'Vaskerummet',
    intro: 'Book vaskerummet til din lejlighed.',

    numberLabel: 'Lejlighedsnummer',
    continue: 'Fortsæt',
    checking: 'Tjekker…',
    invalidNumber: 'Indtast dit lejlighedsnummer.',
    changeNumber: 'Ikke din lejlighed?',

    signupIntro: (number: number) =>
      `Lejlighed ${number} er ikke registreret endnu. Opret en adgangskode for at registrere den.`,
    nameLabel: 'Dit navn',
    phoneLabel: 'Dit telefonnummer',
    createPasswordLabel: 'Vælg en adgangskode',
    confirmPasswordLabel: 'Bekræft adgangskode',
    signupSubmit: 'Opret konto',
    signupSaving: 'Opretter…',
    invalidPassword: 'Vælg en adgangskode med mindst 6 tegn.',
    passwordMismatch: 'Adgangskoderne stemmer ikke overens.',

    loginIntro: (number: number) => `Velkommen tilbage, lejlighed ${number}.`,
    passwordLabel: 'Adgangskode',
    loginSubmit: 'Log ind',
    loginSaving: 'Logger ind…',
    wrongPassword: (number: number) =>
      `Forkert adgangskode. Hvis du har glemt den, så bed admin om at nulstille lejlighed ${number}.`,
    forgotPassword: (number: number) =>
      `Glemt din adgangskode? Bed admin om at nulstille lejlighed ${number}.`,
  },

  claimApartment: {
    title: 'Hvilken lejlighed er du?',
    intro:
      'Alle i bygningen kan se, hvilken lejlighed der har booket hvilken tid, samt dit navn og telefonnummer, så de kan kontakte dig om en booking.',
    numberLabel: 'Lejlighedsnummer',
    nameLabel: 'Dit navn',
    phoneLabel: 'Dit telefonnummer',
    submit: 'Det er min lejlighed',
    saving: 'Gemmer…',
    invalidNumber: 'Indtast dit lejlighedsnummer.',
    invalidName: 'Indtast dit navn.',
    invalidPhone: 'Indtast dit telefonnummer.',
    wrongAccount: 'Ikke din lejlighed?',
  },

  grid: {
    title: 'Vaskerummet',
    subtitle: (apartmentNumber: number) => `Du er lejlighed ${apartmentNumber}`,
    free: 'Ledig',
    apartment: (number: number) => `Lejl. ${number}`,
    yours: 'Dig',
    claimable: 'Kan overtages',
    today: 'I dag',
    tomorrow: 'I morgen',
    horizonNote: (days: number) => `Du kan booke op til ${days} dage frem.`,
    legendFree: 'Ledig',
    legendYours: 'Din',
    legendTaken: 'Booket',
    legendClaimPending: 'Midlertidigt overtaget',
    legendClaimable: 'Kan overtages',

    contactLink: 'Kontakt',

    actionBook: 'Book denne tid',
    actionBooking: 'Booker…',
    actionCancel: 'Annuller booking',
    actionRelease: 'Frigiv tiden',
    actionClaim: 'Overtag denne tid',

    slotOver: 'Denne tid er overstået.',
    takenBy: (number: number) => `Lejlighed ${number} har denne tid.`,
    inGraceWindow: (time: string) =>
      `Denne tid er booket. Hvis der ikke kører en vask, kan den overtages kl. ${time}.`,

    /** The compact badge shown directly on a claimed-but-not-yet-due slot. */
    claimPendingBadge: 'Overtaget',
    /** Shown in the expanded panel for everyone except the claimer themselves. */
    claimPendingMessage: (apartmentNumber: number, time: string) =>
      `Lejlighed ${apartmentNumber} overtog denne tid for nylig og har indtil kl. ${time} til at starte vasken.`,
    /** Shown to the claimer themselves, paired with a live countdown. */
    startWashWithin: 'Du har overtaget denne tid. Start din vask inden for:',

    protectedUntil: (time: string) =>
      `Denne tid er din indtil kl. ${time}. Herefter kan den overtages, hvis der ikke kører en vask.`,
    alreadyHaveFutureBooking:
      'Du har allerede en kommende booking. Annuller den, før du booker en ny.',
    beyondHorizon: (days: number) => `Du kan kun booke op til ${days} dage frem.`,
  },

  confirm: {
    cancelTitle: 'Annuller denne booking?',
    cancelBody: (slot: string, day: string) => `${day}, ${slot}. Tiden bliver ledig for andre.`,
    cancelConfirm: 'Annuller bookingen',
    cancelKeep: 'Behold den',

    releaseTitle: 'Frigiv denne tid?',
    releaseBody: (slot: string, day: string) =>
      `${day}, ${slot}. Tiden er startet, så den bliver i historikken som frigivet af dig. Andre kan bruge resten af perioden.`,
    releaseConfirm: 'Frigiv tiden',
    releaseKeep: 'Behold den',
  },

  /**
   * Deliberate wording — do not soften it. The app cannot see the machines, so
   * the only thing standing between a claim and a stolen wash is the person
   * reading this. `minutes` is 15 or 30 depending on whether this is a claim
   * of an original booking or of an earlier claim (R6 amendment) — never
   * hardcode a number in this text.
   */
  claimDialog: {
    title: 'Overtag denne tid?',
    body: (apartmentNumber: number, minutes: number) =>
      [
        `Denne tid tilhører lejlighed ${apartmentNumber}, og der er gået ${minutes} minutter, siden den blev booket.`,
        'Hvis du er i vaskerummet og kan se, at der ikke kører en vask, kan du overtage tiden for resten af perioden.',
        'Appen kan ikke se, om maskinerne kører. Overtag kun tiden, hvis du faktisk har tjekket. Din overtagelse registreres og er synlig for alle i bygningen.',
      ] as const,
    cancel: 'Annuller',
    confirm: 'Jeg har tjekket — overtag tiden',
    claiming: 'Overtager…',
  },

  history: {
    title: 'Historik',

    lastWashTitle: 'Seneste vask pr. lejlighed',
    lastWashIntro: 'Ældste først, så lejligheder der ikke har vasket i lang tid, står øverst.',
    lastWashNever: 'Ingen vask registreret',

    logTitle: 'Log',
    logIntro: 'Alt fra de seneste 60 dage, nyeste først.',
    logEmpty: 'Intet inden for de seneste 60 dage.',
    logRetention: (days: number) =>
      `Intet bliver nogensinde slettet. Denne side viser de seneste ${days} dage.`,

    /** e.g. "Lejl. 14 — overtaget af lejl. 7 kl. 07:45" */
    logTakenOver: (apartmentNumber: number, byNumber: number, atTime: string) =>
      `Lejl. ${apartmentNumber} — overtaget af lejl. ${byNumber} kl. ${atTime}`,
    logCancelled: (apartmentNumber: number) => `Lejl. ${apartmentNumber} — annulleret`,
    logReleased: (apartmentNumber: number, atTime: string) =>
      `Lejl. ${apartmentNumber} — frigivet kl. ${atTime}`,
    logClaimed: (apartmentNumber: number, fromNumber: number) =>
      `Lejl. ${apartmentNumber} — overtaget fra lejl. ${fromNumber}`,
    logBooked: (apartmentNumber: number) => `Lejl. ${apartmentNumber}`,
  },

  admin: {
    title: 'Admin',
    intro: 'Kun for den, der administrerer bygningen.',

    resetTitle: 'Nulstil en lejlighed',
    resetIntro:
      'Brug denne funktion, når en beboer flytter ud, nogen har registreret det forkerte nummer, eller en adgangskode er glemt. Den rydder login og kontaktoplysninger, så lejligheden kan registreres igen — af den nye beboer, eller den samme med en ny adgangskode. Bookinger i historikken beholder den lejlighed, de blev lavet af.',
    resetApartmentLabel: 'Lejlighedsnummer',
    resetSubmit: 'Nulstil lejlighed',
    resetConfirm: (number: number) =>
      `Nulstil lejlighed ${number}? Login og kontaktoplysninger bliver ryddet, og lejligheden kan registreres igen. Dette kan ikke fortrydes.`,
    resetDone: (number: number) =>
      `Lejlighed ${number} er blevet nulstillet og kan registreres igen.`,
  },

  contactDialog: {
    title: (apartmentNumber: number) => `Kontakt lejlighed ${apartmentNumber}`,
    close: 'Luk',
  },

  myPage: {
    title: 'Min side',
    subtitle: (apartmentNumber: number) => `Lejlighed ${apartmentNumber}`,

    detailsTitle: 'Dine kontaktoplysninger',
    detailsIntro: 'Synlig for alle i bygningen, så de kan kontakte dig om en booking.',
    nameLabel: 'Dit navn',
    phoneLabel: 'Dit telefonnummer',
    save: 'Gem',
    saving: 'Gemmer…',
    saved: 'Gemt.',

    bookingsTitle: 'Dine bookinger',
    bookingsEmpty: 'Du har ingen bookinger endnu.',
  },
} as const

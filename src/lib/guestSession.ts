/**
 * One-shot suppression of the automatic guest session.
 *
 * The app enters guest mode by itself whenever a guarded route is reached
 * without a session — a login wall in front of a tracker people want to *try*
 * is the single biggest drop-off on mobile.
 *
 * That creates one problem this module exists to solve: signing out also leaves
 * you without a session, so the auto-guest would immediately mint a fresh
 * anonymous account and the sign-in screen would be unreachable. A flag set by
 * signOut and consumed by the guard distinguishes "no session yet" from "no
 * session on purpose", which timing-dependent alternatives (navigate first,
 * hope the guard doesn't render) do not do reliably.
 *
 * Module scope rather than context: it is read during a render pass triggered
 * by an auth state change, and it must survive the remount that follows.
 */

let suppressed = false

/** Called from signOut, so every caller gets the behaviour without opting in. */
export function suppressAutoGuest(): void {
  suppressed = true
}

/** Reads and clears the flag. Returns true when auto-guest should be skipped. */
export function consumeAutoGuestSuppression(): boolean {
  const was = suppressed
  suppressed = false
  return was
}

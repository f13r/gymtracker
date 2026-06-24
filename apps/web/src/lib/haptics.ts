/**
 * Fire a haptic tick. Must be called *synchronously inside a user-gesture
 * handler* (e.g. onClick) — Chrome/Samsung Internet on Android silently ignore
 * navigator.vibrate() when it runs in a detached async callback (a Promise/
 * react-query onMutate/onSuccess), which is why the buzz "doesn't work".
 *
 * No-op on devices without the Vibration API (e.g. iOS Safari).
 */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

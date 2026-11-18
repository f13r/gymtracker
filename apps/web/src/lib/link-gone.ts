const KEY = 'gymtracker-link-gone'

/** Remember the athlete's name across the hard navigation that follows a lost link. */
export function rememberLinkGone(name: string): void {
  try {
    sessionStorage.setItem(KEY, name)
  } catch {
    // No sessionStorage → the navigation still happens, just without the notice.
  }
}

/** The athlete name left by `rememberLinkGone`, once; null when there is none. */
export function consumeLinkGoneNotice(): string | null {
  try {
    const name = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return name
  } catch {
    return null
  }
}

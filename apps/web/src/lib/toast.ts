import { create } from 'zustand'

/** One short-lived confirmation message at a time, rendered by `<Toaster />`. */
export const useToast = create<{ message: string | null; id: number }>(() => ({ message: null, id: 0 }))

export function showToast(message: string): void {
  useToast.setState(s => ({ message, id: s.id + 1 }))
}

export function dismissToast(): void {
  useToast.setState({ message: null })
}

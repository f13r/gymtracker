import i18n from '@/lib/i18n'

/** BCP 47 locale for `toLocaleDateString` / `Intl` that follows the UI language. */
export function dateLocale(): string {
  return i18n.language === 'en' ? 'en' : 'uk-UA'
}

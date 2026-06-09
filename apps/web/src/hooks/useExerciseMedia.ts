import { useQuery } from '@tanstack/react-query'

const WGER_API = 'https://wger.de/api/v2'
const ENGLISH = 2 // wger language id for English

interface WgerExerciseInfo {
  images?: Array<{ image: string; is_main: boolean }>
  translations?: Array<{ language: number; name?: string; description?: string }>
}

export interface ExerciseMedia {
  imageUrl: string | null
  description: string | null
}

// Turn wger's HTML description into readable plain text — strip tags, decode the few entities
// wger uses, and keep paragraph/list breaks as newlines so the drawer renders it safely.
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|ul|ol|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()
}

// Each exercise stores its wger.de exercise (base) id, so we fetch exactly the right
// demonstration image and description by id — no name search or fuzzy matching.
async function fetchExerciseMedia(wgerId: number): Promise<ExerciseMedia> {
  try {
    const res = await fetch(`${WGER_API}/exerciseinfo/${wgerId}/?format=json`)
    if (!res.ok) {
      return { imageUrl: null, description: null }
    }
    const data: WgerExerciseInfo = await res.json()
    const mainImage = data.images?.find(i => i.is_main) ?? data.images?.[0]
    const translation =
      data.translations?.find(t => t.language === ENGLISH && t.description) ??
      data.translations?.find(t => t.description)
    return {
      imageUrl: mainImage?.image ?? null,
      description: translation?.description ? htmlToText(translation.description) : null,
    }
  } catch {
    return { imageUrl: null, description: null }
  }
}

export function useExerciseMedia(wgerId: number | null | undefined) {
  return useQuery({
    queryKey: ['exercise-media', wgerId],
    queryFn: () => fetchExerciseMedia(wgerId as number),
    staleTime: Infinity,
    retry: false,
    enabled: wgerId != null,
  })
}

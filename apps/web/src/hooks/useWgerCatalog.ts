import { useQuery } from '@tanstack/react-query'

const WGER_API = 'https://wger.de/api/v2'
const ENGLISH = 2 // wger language id for English

interface WgerTranslationPage {
  next: string | null
  results: Array<{ exercise: number; name: string }>
}

interface WgerImagePage {
  next: string | null
  results: Array<{ exercise: number; image: string; is_main: boolean }>
}

export interface WgerCatalogEntry {
  id: number
  name: string
  imageUrl: string
}

// Only exercises that actually have a demonstration image are worth linking, so we join the English
// translations against the image set. Fetched once and cached forever — shared by every link picker.
async function fetchWgerCatalog(): Promise<WgerCatalogEntry[]> {
  // exercise (base) id -> main image url
  const images = new Map<number, string>()
  let imgUrl: string | null = `${WGER_API}/exerciseimage/?format=json&limit=900`
  while (imgUrl) {
    const res: Response = await fetch(imgUrl)
    if (!res.ok) {
      break
    }
    const page: WgerImagePage = await res.json()
    for (const r of page.results) {
      if (!images.has(r.exercise) || r.is_main) {
        images.set(r.exercise, r.image)
      }
    }
    imgUrl = page.next
  }

  const out: WgerCatalogEntry[] = []
  const seen = new Set<number>()
  let trUrl: string | null = `${WGER_API}/exercise-translation/?language=${ENGLISH}&format=json&limit=500`
  while (trUrl) {
    const res: Response = await fetch(trUrl)
    if (!res.ok) {
      break
    }
    const page: WgerTranslationPage = await res.json()
    for (const r of page.results) {
      const image = images.get(r.exercise)
      if (image && !seen.has(r.exercise)) {
        seen.add(r.exercise)
        out.push({ id: r.exercise, name: r.name, imageUrl: image })
      }
    }
    trUrl = page.next
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function useWgerCatalog() {
  return useQuery({
    queryKey: ['wger-catalog'],
    queryFn: fetchWgerCatalog,
    staleTime: Infinity,
    retry: false,
  })
}

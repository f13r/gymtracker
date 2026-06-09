import { BadRequestException, Injectable, Logger } from '@nestjs/common'

import type { ExerciseCategory, ExerciseEquipment } from '@gymtracker/shared'

const WGER_API = 'https://wger.de/api/v2'
const ENGLISH = 2 // wger language id for English

// wger exercisecategory id -> our category enum.
const CATEGORY_MAP: Record<number, ExerciseCategory> = {
  10: 'core', // Abs
  8: 'other', // Arms (mixed biceps/triceps — no single push/pull fit)
  12: 'pull', // Back
  14: 'legs', // Calves
  15: 'cardio', // Cardio
  11: 'push', // Chest
  9: 'legs', // Legs
  13: 'push', // Shoulders
}

// wger equipment id -> our equipment enum, resolved by priority (first matching group wins).
// wger has no "machine"/"cable" equipment, and bench/mat/ball are accessories we ignore.
const EQUIPMENT_PRIORITY: Array<[Set<number>, ExerciseEquipment]> = [
  [new Set([1, 2]), 'barbell'], // Barbell, SZ-Bar
  [new Set([3, 10]), 'dumbbell'], // Dumbbell, Kettlebell
  [new Set([11]), 'cable'], // Resistance band (closest to cable resistance)
  [new Set([6, 7]), 'bodyweight'], // Pull-up bar, none (bodyweight exercise)
]

interface WgerExerciseInfo {
  category?: { id: number; name: string }
  equipment?: Array<{ id: number; name: string }>
  translations?: Array<{ language: number; name?: string }>
}

export interface WgerExerciseMetadata {
  name: string
  category?: ExerciseCategory | undefined
  equipmentType?: ExerciseEquipment | undefined
}

@Injectable()
export class WgerService {
  private readonly logger = new Logger(WgerService.name)

  // Pull an exercise's metadata from wger by its (base) id. Throws BadRequest on an
  // unknown id or unreachable upstream so the caller can surface a clear 400.
  async fetchExerciseMetadata(wgerId: number): Promise<WgerExerciseMetadata> {
    let res: Response
    try {
      res = await fetch(`${WGER_API}/exerciseinfo/${wgerId}/?format=json`)
    } catch (err) {
      this.logger.warn(`wger fetch failed for ${wgerId}: ${String(err)}`)
      throw new BadRequestException(`Could not reach wger for id ${wgerId}`)
    }
    if (res.status === 404) {
      throw new BadRequestException(`No wger exercise found for id ${wgerId}`)
    }
    if (!res.ok) {
      throw new BadRequestException(`Could not load wger exercise ${wgerId} (status ${res.status})`)
    }

    const data = (await res.json()) as WgerExerciseInfo
    const name = pickName(data.translations ?? [])
    if (!name) {
      throw new BadRequestException(`wger exercise ${wgerId} has no usable name`)
    }

    return {
      name,
      category: data.category ? CATEGORY_MAP[data.category.id] : undefined,
      equipmentType: resolveEquipment(data.equipment ?? []),
    }
  }
}

function pickName(translations: Array<{ language: number; name?: string }>): string | null {
  const english = translations.find(t => t.language === ENGLISH && t.name?.trim())
  const any = translations.find(t => t.name?.trim())
  return (english?.name ?? any?.name)?.trim() ?? null
}

function resolveEquipment(equipment: Array<{ id: number }>): ExerciseEquipment | undefined {
  const ids = new Set(equipment.map(e => e.id))
  for (const [group, mapped] of EQUIPMENT_PRIORITY) {
    for (const id of group) {
      if (ids.has(id)) {
        return mapped
      }
    }
  }
  return undefined
}

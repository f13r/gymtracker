import { describe, it, expect } from 'vitest'

import { parseFitnotesCsv, buildImportPlan, mapCategory, toKg, parseDurationSec } from './fitnotes-parser'

const HEADER = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment'

describe('parseFitnotesCsv', () => {
  it('reconstructs exercise names containing unquoted commas', () => {
    const csv = [HEADER, '2025-06-04,Тяга блока, широко,Back,20.0,kgs,20,,,,""'].join('\n')
    const row = parseFitnotesCsv(csv)[0]!
    expect(row.exercise).toBe('Тяга блока, широко')
    expect(row.category).toBe('Back')
    expect(row.weight).toBe('20.0')
    expect(row.weightUnit).toBe('kgs')
    expect(row.reps).toBe('20')
  })

  it('handles names with multiple commas', () => {
    const csv = [HEADER, '2025-06-04,Біцепс, Крива штанга, стоячи,Biceps,15.0,kgs,12,,,,""'].join('\n')
    const row = parseFitnotesCsv(csv)[0]!
    expect(row.exercise).toBe('Біцепс, Крива штанга, стоячи')
    expect(row.category).toBe('Biceps')
    expect(row.reps).toBe('12')
  })

  it('keeps a quoted comment with a comma intact and aligned', () => {
    const csv = [HEADER, '2025-06-04,Жим,Chest,80.0,kgs,5,,,,"hard, very hard"'].join('\n')
    const row = parseFitnotesCsv(csv)[0]!
    expect(row.exercise).toBe('Жим')
    expect(row.category).toBe('Chest')
    expect(row.comment).toBe('hard, very hard')
  })

  it('strips a leading UTF-8 BOM', () => {
    const csv = ['﻿' + HEADER, '2025-06-04,Жим,Chest,80.0,kgs,5,,,,""'].join('\n')
    const rows = parseFitnotesCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.exercise).toBe('Жим')
  })

  it('drops the header and tolerates a trailing newline', () => {
    const csv = [HEADER, '2025-06-04,Жим,Chest,80.0,kgs,5,,,,""', ''].join('\n')
    expect(parseFitnotesCsv(csv)).toHaveLength(1)
  })
})

describe('mapCategory', () => {
  it('maps the English FitNotes categories onto the PPL vocabulary', () => {
    expect(mapCategory('Chest')).toBe('push')
    expect(mapCategory('Shoulders')).toBe('push')
    expect(mapCategory('Triceps')).toBe('push')
    expect(mapCategory('Back')).toBe('pull')
    expect(mapCategory('Biceps')).toBe('pull')
    expect(mapCategory('Legs')).toBe('legs')
    expect(mapCategory('Abs')).toBe('core')
  })

  it('is case-insensitive and falls back to other', () => {
    expect(mapCategory('cHeSt')).toBe('push')
    expect(mapCategory('Olympic')).toBe('other')
  })
})

describe('toKg', () => {
  it('passes kg through and rounds', () => {
    expect(toKg('83.0', 'kgs')).toBe(83)
    expect(toKg('22.5', 'kg')).toBe(22.5)
  })
  it('converts pounds to kg', () => {
    expect(toKg('100', 'lbs')).toBeCloseTo(45.3592, 3)
  })
  it('returns null for blank', () => {
    expect(toKg('', 'kgs')).toBeNull()
  })
})

describe('parseDurationSec', () => {
  it('parses H:MM:SS', () => {
    expect(parseDurationSec('1:02:03')).toBe(3723)
  })
  it('parses MM:SS', () => {
    expect(parseDurationSec('1:30')).toBe(90)
  })
  it('treats 0:00:00 and blank as null', () => {
    expect(parseDurationSec('0:00:00')).toBeNull()
    expect(parseDurationSec('')).toBeNull()
  })
})

describe('buildImportPlan', () => {
  function plan(lines: string[]) {
    return buildImportPlan(parseFitnotesCsv([HEADER, ...lines].join('\n')))
  }

  it('skips rows with no reps, weight, or duration (Plank-style) and drops fully-empty exercises', () => {
    const p = plan([
      '2026-04-27,Plank,Abs,0.0,kgs,,,,0:00:00,""',
      '2026-04-27,Plank,Abs,0.0,kgs,,,,0:00:00,""',
      '2026-04-27,Жим,Chest,80.0,kgs,5,,,,""',
    ])
    expect(p.report.skippedRows).toBe(2)
    expect(p.report.keptRows).toBe(1)
    expect(p.report.droppedExercises).toEqual(['Plank'])
    expect(p.exercises.map(e => e.name)).toEqual(['Жим'])
  })

  it('keeps bodyweight rows that have real reps even when weight is 0', () => {
    const p = plan(['2026-04-27,Бруси,Chest,0.0,kgs,10,,,,""'])
    expect(p.report.keptRows).toBe(1)
    expect(p.sets[0]!.reps).toBe(10)
    expect(p.sets[0]!.weightKg).toBeNull()
  })

  it('numbers sets per exercise within a date, in file order', () => {
    const p = plan([
      '2026-04-27,Жим,Chest,80.0,kgs,5,,,,""',
      '2026-04-27,Жим,Chest,82.5,kgs,4,,,,""',
      '2026-04-27,Присед,Legs,100,kgs,5,,,,""',
    ])
    const zhym = p.sets.filter(s => s.exerciseName === 'Жим')
    expect(zhym.map(s => s.setNumber)).toEqual([1, 2])
    expect(p.sets.find(s => s.exerciseName === 'Присед')!.setNumber).toBe(1)
  })

  it('creates one session per date named from its mapped categories', () => {
    const p = plan([
      '2026-04-27,Жим,Chest,80,kgs,5,,,,""',
      '2026-04-27,Присед,Legs,100,kgs,5,,,,""',
      '2026-04-28,Підтягування,Back,83,kgs,5,,,,""',
    ])
    expect(p.sessions).toHaveLength(2)
    expect(p.sessions[0]).toEqual({ date: '2026-04-27', name: 'Push / Legs' })
    expect(p.sessions[1]).toEqual({ date: '2026-04-28', name: 'Pull' })
  })

  it('attaches comments to their set and counts them', () => {
    const p = plan(['2026-05-11,Бруси,Chest,0.0,kgs,10,,,,"важко останній"'])
    expect(p.sets[0]!.notes).toBe('важко останній')
    expect(p.report.commentsKept).toBe(1)
  })

  it('flags unknown categories without crashing', () => {
    const p = plan(['2026-04-27,Strange,Olympic,50,kgs,3,,,,""'])
    expect(p.exercises[0]!.category).toBe('other')
    expect(p.report.unknownCategories).toEqual(['Olympic'])
  })

  it('reports the date range', () => {
    const p = plan(['2025-06-04,Жим,Chest,80,kgs,5,,,,""', '2026-06-03,Жим,Chest,85,kgs,5,,,,""'])
    expect(p.report.dateRange).toEqual({ from: '2025-06-04', to: '2026-06-03' })
  })

  it('filters out rows before --since and counts them', () => {
    const p = buildImportPlan(
      parseFitnotesCsv(
        [
          HEADER,
          '2026-04-30,Жим,Chest,80,kgs,5,,,,""',
          '2026-05-01,Жим,Chest,82,kgs,5,,,,""',
          '2026-05-10,Присед,Legs,100,kgs,5,,,,""',
        ].join('\n'),
      ),
      { since: '2026-05-01' },
    )
    expect(p.report.filteredBySince).toBe(1)
    expect(p.report.keptRows).toBe(2)
    expect(p.sessions.map(s => s.date)).toEqual(['2026-05-01', '2026-05-10'])
    expect(p.report.dateRange).toEqual({ from: '2026-05-01', to: '2026-05-10' })
  })
})

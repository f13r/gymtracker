import { describe, expect, it } from 'vitest'

import { AgentDocumentSchema, agentDocumentJsonSchema } from './agent.schema.js'

const full = {
  user: 'inna',
  exercises: [
    {
      name: 'Bulgarian Split Squat',
      category: 'legs',
      equipmentType: 'dumbbell',
      imageUrl: 'https://example.com/b.png',
    },
    { name: 'Lat Pulldown (wide)', renameFrom: 'Lat Pulldown', description: null },
  ],
  templates: [
    {
      name: 'Legs A',
      notes: 'Slow eccentrics',
      exercises: [
        { exercise: 'Squat', sets: 3, reps: 8, weightKg: 40 },
        { exercise: 'Bulgarian Split Squat', sets: 3, reps: 10, supersetGroup: 'A' },
        { exercise: 'Plank', sets: 3, reps: 1, supersetGroup: 'A' },
      ],
    },
  ],
  weekly: { mon: 'Legs A', wed: null },
  remove: { exercises: ['Old Thing'], templates: ['Full Body'] },
}

const issues = (doc: unknown) => {
  const result = AgentDocumentSchema.safeParse(doc)
  return result.success ? [] : result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
}

describe('AgentDocumentSchema', () => {
  it('accepts a full document', () => {
    expect(issues(full)).toEqual([])
  })

  it('accepts a library-only document without a user', () => {
    expect(issues({ exercises: [{ name: 'Face Pull' }], remove: { exercises: ['Old Thing'] } })).toEqual([])
  })

  it('trims names', () => {
    const doc = AgentDocumentSchema.parse({ exercises: [{ name: '  Face Pull ' }] })
    expect(doc.exercises?.[0]?.name).toBe('Face Pull')
  })

  it.each([
    ['templates', { templates: full.templates }],
    ['weekly', { weekly: { mon: null } }],
    ['templates to remove', { remove: { templates: ['Push'] } }],
  ])('requires a user when the document has %s', (_, doc) => {
    expect(issues(doc)).toContainEqual(expect.stringMatching(/^user: /))
  })

  it('refuses an image URL that is not https', () => {
    expect(issues({ exercises: [{ name: 'X', imageUrl: 'http://example.com/x.png' }] })).toEqual([
      expect.stringMatching(/^exercises\.0\.imageUrl: /),
    ])
  })

  it('refuses unknown fields (a typo must not be silently ignored)', () => {
    expect(issues({ exercises: [{ name: 'X', equipment: 'barbell' }] })).not.toEqual([])
    expect(issues({ user: 'u', weekly: { monday: 'Push' } })).not.toEqual([])
  })

  it('refuses the same Exercise or Template name twice, ignoring case', () => {
    expect(issues({ exercises: [{ name: 'Squat' }, { name: 'squat' }] })).toEqual([
      expect.stringMatching(/^exercises\.1\.name: .*twice/),
    ])
    const tpl = { name: 'Push', exercises: [{ exercise: 'Squat', sets: 3, reps: 5 }] }
    expect(issues({ user: 'u', templates: [tpl, { ...tpl, name: 'PUSH' }] })).toEqual([
      expect.stringMatching(/^templates\.1\.name: .*twice/),
    ])
  })

  it('refuses sets or reps below 1', () => {
    const tpl = { name: 'Push', exercises: [{ exercise: 'Squat', sets: 0, reps: 5 }] }
    expect(issues({ user: 'u', templates: [tpl] })).toEqual([expect.stringMatching(/exercises\.0\.sets/)])
  })
})

describe('agentDocumentJsonSchema', () => {
  it('is a draft 2020-12 JSON Schema of the document', () => {
    const schema = agentDocumentJsonSchema() as {
      $schema: string
      type: string
      properties: Record<string, unknown>
      additionalProperties: boolean
    }
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(Object.keys(schema.properties).sort()).toEqual(['exercises', 'remove', 'templates', 'user', 'weekly'])
    expect(schema.additionalProperties).toBe(false)
  })

  it('describes the weekdays and the Template exercise fields', () => {
    const json = JSON.stringify(agentDocumentJsonSchema())
    for (const key of ['"mon"', '"sun"', '"supersetGroup"', '"weightKg"', '"renameFrom"', '"imageUrl"']) {
      expect(json).toContain(key)
    }
  })
})

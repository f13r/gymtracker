import { useParams, useSearch } from '@tanstack/react-router'

import { WorkoutLogger } from '@/components/workout/WorkoutLogger'

export function WorkoutSessionPage() {
  const { sessionId } = useParams({ from: '/workout/$sessionId' })
  const { exercise } = useSearch({ from: '/workout/$sessionId' })
  return <WorkoutLogger activeExerciseId={exercise} sessionId={sessionId} />
}

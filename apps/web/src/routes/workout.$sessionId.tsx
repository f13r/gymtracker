import { useParams } from '@tanstack/react-router';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';

export function WorkoutSessionPage() {
  const { sessionId } = useParams({ from: '/workout/$sessionId' });
  return <WorkoutLogger sessionId={sessionId} />;
}

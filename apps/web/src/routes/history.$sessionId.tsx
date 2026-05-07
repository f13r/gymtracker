import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workoutsApi } from '@/api/workouts';
import { Card, CardContent } from '@/components/ui/card';

export function HistoryDetailPage() {
  const { sessionId } = useParams({ from: '/history/$sessionId' });
  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => workoutsApi.getSession(sessionId),
  });

  if (!session) return <div className="p-4">Loading...</div>;

  const setsByExercise = (session.sets as any[]).reduce((acc: Record<string, any[]>, s: any) => {
    if (!acc[s.exerciseId]) acc[s.exerciseId] = [];
    acc[s.exerciseId].push(s);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">{session.name}</h1>
      <p className="text-muted-foreground text-sm">
        {new Date(session.startedAt * 1000).toLocaleString()}
      </p>
      {Object.entries(setsByExercise).map(([exerciseId, sets]) => (
        <Card key={exerciseId}>
          <CardContent className="py-3">
            <p className="font-medium mb-2">Exercise {exerciseId.slice(0, 8)}</p>
            {(sets as any[]).map((s: any, i: number) => (
              <div key={s.id} className="text-sm flex justify-between py-1 border-b last:border-0">
                <span className="text-muted-foreground">Set {i + 1}</span>
                <span>{s.weightKg} kg × {s.reps} reps</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

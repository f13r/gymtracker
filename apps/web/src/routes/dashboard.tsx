import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from '@tanstack/react-router';
import { workoutsApi } from '@/api/workouts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: active } = useQuery({ queryKey: ['activeSession'], queryFn: workoutsApi.getActiveSession });
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: workoutsApi.getSessions });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">GymTracker</h1>
      {active && (
        <Card className="border-green-500">
          <CardHeader><CardTitle>Active: {active.name}</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/workout/$sessionId', params: { sessionId: active.id } })}>
              Resume Workout
            </Button>
          </CardContent>
        </Card>
      )}
      <Button className="w-full" asChild>
        <Link to="/workout/start">Start New Workout</Link>
      </Button>
      <div className="space-y-2">
        <h2 className="font-semibold">Recent Workouts</h2>
        {(sessions as any[]).slice(0, 5).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="py-3 flex justify-between">
              <span>{s.name}</span>
              <span className="text-muted-foreground text-sm">{new Date(s.startedAt * 1000).toLocaleDateString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

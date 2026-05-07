import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { workoutsApi } from '@/api/workouts';
import { Card, CardContent } from '@/components/ui/card';

export function HistoryPage() {
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: workoutsApi.getSessions });
  const finished = (sessions as any[]).filter((s: any) => s.finishedAt);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">History</h1>
      {finished.length === 0 && <p className="text-muted-foreground">No completed workouts yet.</p>}
      {finished.map((s: any) => (
        <Link key={s.id} to="/history/$sessionId" params={{ sessionId: s.id }}>
          <Card className="hover:bg-muted cursor-pointer">
            <CardContent className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(s.startedAt * 1000).toLocaleDateString()} ·{' '}
                  {Math.round((s.finishedAt - s.startedAt) / 60)} min
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

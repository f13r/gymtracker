import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workoutsApi } from '@/api/workouts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useWorkoutStore } from '@/stores/workout.store';

export function WorkoutStartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveSession = useWorkoutStore((s) => s.setActiveSession);
  const [name, setName] = useState('');

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: workoutsApi.getTemplates });

  const start = useMutation({
    mutationFn: (templateId?: string) =>
      workoutsApi.startSession({ name: name || 'Quick Workout', templateId }),
    onSuccess: (session) => {
      setActiveSession(session.id);
      queryClient.invalidateQueries({ queryKey: ['activeSession'] });
      navigate({ to: '/workout/$sessionId', params: { sessionId: session.id } });
    },
  });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Start Workout</h1>
      <Input placeholder="Workout name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <Button className="w-full" onClick={() => start.mutate(undefined)} disabled={start.isPending}>
        Start Ad-hoc Workout
      </Button>
      {(templates as any[]).length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">From Template</h2>
          {(templates as any[]).map((t: any) => (
            <Card key={t.id} className="cursor-pointer hover:bg-muted" onClick={() => start.mutate(t.id)}>
              <CardHeader><CardTitle className="text-base">{t.name}</CardTitle></CardHeader>
              {t.notes && <CardContent className="pt-0 text-sm text-muted-foreground">{t.notes}</CardContent>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

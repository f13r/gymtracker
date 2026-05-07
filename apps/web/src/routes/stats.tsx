import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/api/stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export function StatsPage() {
  const { data: prs = [] } = useQuery({ queryKey: ['stats', 'prs'], queryFn: () => statsApi.getPRs() });
  const { data: volume = [] } = useQuery({ queryKey: ['stats', 'volume'], queryFn: () => statsApi.getVolume() });
  const { data: streak } = useQuery({ queryKey: ['stats', 'streak'], queryFn: statsApi.getStreak });
  const { data: bodyWeight = [] } = useQuery({ queryKey: ['stats', 'bodyweight'], queryFn: () => statsApi.getBodyWeight() });
  const { data: frequency = [] } = useQuery({ queryKey: ['stats', 'frequency'], queryFn: statsApi.getFrequency });

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Stats</h1>

      {streak && (
        <Card>
          <CardHeader><CardTitle>Streak</CardTitle></CardHeader>
          <CardContent className="flex gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold">{streak.current}</p>
              <p className="text-sm text-muted-foreground">Current</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">{streak.longest}</p>
              <p className="text-sm text-muted-foreground">Longest</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(prs as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Personal Records</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(prs as any[]).map((pr: any) => (
              <div key={pr.exercise_id} className="flex justify-between text-sm">
                <span>{pr.name}</span>
                <span className="font-medium">{pr.maxWeightKg} kg × {pr.repsAtMax}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(volume as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Volume Over Time</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={volume as any[]}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="volume" stroke="#22c55e" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(bodyWeight as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Body Weight</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={bodyWeight as any[]}>
                <XAxis dataKey="recordedAt" tickFormatter={(v) => new Date(v * 1000).toLocaleDateString()} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => new Date((v as number) * 1000).toLocaleDateString()} />
                <Line type="monotone" dataKey="weightKg" stroke="#3b82f6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(frequency as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Weekly Frequency</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={frequency as any[]}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

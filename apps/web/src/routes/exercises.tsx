import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exercisesApi } from '@/api/exercises';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export function ExercisesPage() {
  const [search, setSearch] = useState('');
  const { data: exercises = [] } = useQuery({ queryKey: ['exercises'], queryFn: exercisesApi.getAll });

  const filtered = (exercises as any[]).filter((e: any) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, any[]>, ex: any) => {
    const cat = ex.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ex);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Exercise Library</h1>
      <Input placeholder="Search exercises..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {Object.entries(grouped).map(([cat, exs]) => (
        <div key={cat}>
          <h2 className="font-semibold capitalize mb-2">{cat}</h2>
          <div className="space-y-2">
            {exs.map((ex: any) => (
              <Card key={ex.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <span>{ex.name}</span>
                  {ex.equipment && <Badge variant="secondary">{ex.equipment}</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bodyApi } from '@/api/body';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@tanstack/react-router';

export function BodyPage() {
  const queryClient = useQueryClient();
  const [newWeight, setNewWeight] = useState('');

  const { data: weights = [] } = useQuery({ queryKey: ['bodyWeights'], queryFn: bodyApi.getWeights });

  const addWeight = useMutation({
    mutationFn: () => bodyApi.addWeight({ weightKg: parseFloat(newWeight) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bodyWeights'] });
      setNewWeight('');
    },
  });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Body Tracking</h1>

      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Weight (kg)"
          value={newWeight}
          onChange={(e) => setNewWeight(e.target.value)}
        />
        <Button onClick={() => addWeight.mutate()} disabled={!newWeight || addWeight.isPending}>
          Add
        </Button>
      </div>

      <Button variant="outline" className="w-full" asChild>
        <Link to="/photos">Progress Photos →</Link>
      </Button>

      <div className="space-y-2">
        <h2 className="font-semibold">Weight Log</h2>
        {(weights as any[]).slice(0, 10).map((w: any) => (
          <Card key={w.id}>
            <CardContent className="py-3 flex justify-between">
              <span>{w.weightKg} kg</span>
              <span className="text-muted-foreground text-sm">{new Date(w.recordedAt * 1000).toLocaleDateString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

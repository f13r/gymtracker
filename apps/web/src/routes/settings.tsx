import { usePreferencesStore } from '@/stores/preferences.store';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { unit, setUnit, restTimerSeconds, setRestTimer } = usePreferencesStore();
  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div>
        <label className="font-medium">Units</label>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setUnit('kg')} className={cn('px-4 py-2 rounded border', unit === 'kg' && 'bg-primary text-primary-foreground')}>kg</button>
          <button onClick={() => setUnit('lb')} className={cn('px-4 py-2 rounded border', unit === 'lb' && 'bg-primary text-primary-foreground')}>lb</button>
        </div>
      </div>
      <div>
        <label className="font-medium">Rest Timer (seconds)</label>
        <input
          type="number"
          value={restTimerSeconds}
          onChange={(e) => setRestTimer(parseInt(e.target.value))}
          className="mt-2 block w-32 border rounded p-2"
        />
      </div>
    </div>
  );
}

import { Link, useRouterState } from '@tanstack/react-router';
import { Home, Dumbbell, BarChart2, Activity, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/workout/start', label: 'Workout', Icon: Dumbbell },
  { to: '/stats', label: 'Stats', Icon: BarChart2 },
  { to: '/body', label: 'Body', Icon: Activity },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState();
  return (
    <div className="flex flex-col h-svh">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <nav className="border-t bg-background grid grid-cols-5 pb-safe">
        {NAV.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex flex-col items-center py-2 text-xs gap-1',
              location.pathname.startsWith(to) ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon size={22} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

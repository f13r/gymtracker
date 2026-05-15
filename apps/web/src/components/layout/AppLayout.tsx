import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Dumbbell, BookOpen, BarChart2, Activity, Settings, Building2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/workout/start', label: 'Workouts', Icon: Dumbbell },
  { to: '/exercises', label: 'Exercises', Icon: BookOpen },
  { to: '/gym', label: 'Gym', Icon: Building2 },
  { to: '/stats', label: 'Stats', Icon: BarChart2 },
  { to: '/body', label: 'Body', Icon: Activity },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState()
  return (
    <div className="bg-background flex h-svh flex-col">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <nav className="border-border bg-card pb-safe grid grid-cols-7 border-t">
        {NAV.map(({ to, label, Icon }) => {
          const active = location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 pt-2 pb-1"
              to={to}
            >
              {active && (
                <span className="bg-primary absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full" />
              )}
              <Icon
                className={cn('transition-colors', active ? 'text-primary' : 'text-muted-foreground')}
                size={20}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span
                className={cn(
                  'text-[10px] font-medium tracking-wide transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

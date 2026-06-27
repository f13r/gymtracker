import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Dumbbell, Library, BarChart2, Activity, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', labelKey: 'home', Icon: Home },
  { to: '/workout/start', labelKey: 'workouts', Icon: Dumbbell },
  { to: '/exercises', labelKey: 'exercises', Icon: Library },
  { to: '/stats', labelKey: 'stats', Icon: BarChart2 },
  { to: '/body', labelKey: 'body', Icon: Activity },
  { to: '/settings', labelKey: 'settings', Icon: Settings },
] as const

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState()
  const { t } = useTranslation('nav')
  return (
    <div className="bg-background flex h-svh flex-col">
      <main className="flex-1 overflow-y-auto">{children}</main>
      <nav className="border-border bg-card pb-safe grid grid-cols-6 border-t">
        {NAV.map(({ to, labelKey, Icon }) => {
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
                {t(labelKey)}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

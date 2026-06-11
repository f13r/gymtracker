import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { profileApi } from './api/profile'
import { AppLayout } from './components/layout/AppLayout'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/onboarding') {return}
    const profile = await profileApi.get().catch(() => null)
    if (!profile?.trainingDays) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('./routes/dashboard').then(m => ({ default: m.DashboardPage }))),
})

const exercisesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/exercises',
  component: lazyRouteComponent(() => import('./routes/exercises').then(m => ({ default: m.ExercisesPage }))),
})

const statsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/stats',
  component: lazyRouteComponent(() => import('./routes/stats').then(m => ({ default: m.StatsPage }))),
})

const bodyRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/body',
  component: lazyRouteComponent(() => import('./routes/body').then(m => ({ default: m.BodyPage }))),
})

const photosRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/photos',
  component: lazyRouteComponent(() => import('./routes/photos').then(m => ({ default: m.PhotosPage }))),
})

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./routes/settings').then(m => ({ default: m.SettingsPage }))),
})

const historyRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/history',
  component: lazyRouteComponent(() => import('./routes/history').then(m => ({ default: m.HistoryPage }))),
})

const historyDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/history/$sessionId',
  component: lazyRouteComponent(() =>
    import('./routes/history.$sessionId').then(m => ({ default: m.HistoryDetailPage })),
  ),
})

const workoutStartRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workout/start',
  component: lazyRouteComponent(() => import('./routes/workout.start').then(m => ({ default: m.WorkoutStartPage }))),
})

const workoutTemplateNewRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workout/template/new',
  component: lazyRouteComponent(() =>
    import('./routes/workout.template.new').then(m => ({ default: m.NewTemplatePage })),
  ),
})

const workoutTemplateEditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workout/template/$templateId',
  component: lazyRouteComponent(() =>
    import('./routes/workout.template.$templateId').then(m => ({ default: m.EditTemplatePage })),
  ),
})

const gymRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/gym',
  component: lazyRouteComponent(() => import('./routes/gym').then(m => ({ default: m.GymPage }))),
})

const programRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/program',
  component: lazyRouteComponent(() => import('./routes/program').then(m => ({ default: m.ProgramPage }))),
})

const calendarRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/calendar',
  component: lazyRouteComponent(() => import('./routes/calendar').then(m => ({ default: m.CalendarPage }))),
})

// Workout logger is fullscreen — outside AppLayout
const workoutSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workout/$sessionId',
  // The Active Exercise (the Exercise the logger is focused on) lives in the URL
  // as the single source of truth, addressed by exerciseId — see ADR-0009.
  validateSearch: (search: Record<string, unknown>): { exercise?: string } => ({
    exercise: typeof search.exercise === 'string' ? search.exercise : undefined,
  }),
  component: lazyRouteComponent(() =>
    import('./routes/workout.$sessionId').then(m => ({ default: m.WorkoutSessionPage })),
  ),
})

// AI log — debug tool, no auth gate, no AppLayout chrome
const aiLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ai-log',
  component: lazyRouteComponent(() => import('./routes/ai-log').then(m => ({ default: m.AiLogPage }))),
})

// Onboarding — outside AppLayout, no auth gate
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: lazyRouteComponent(() => import('./routes/onboarding').then(m => ({ default: m.OnboardingPage }))),
})

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([
    indexRoute,
    dashboardRoute,
    exercisesRoute,
    statsRoute,
    bodyRoute,
    photosRoute,
    settingsRoute,
    historyRoute,
    historyDetailRoute,
    workoutStartRoute,
    workoutTemplateNewRoute,
    workoutTemplateEditRoute,
    gymRoute,
    programRoute,
    calendarRoute,
  ]),
  workoutSessionRoute,
  onboardingRoute,
  aiLogRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

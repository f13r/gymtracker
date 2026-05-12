import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { AppLayout } from './components/layout/AppLayout'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
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

// Workout logger is fullscreen — outside AppLayout
const workoutSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workout/$sessionId',
  component: lazyRouteComponent(() =>
    import('./routes/workout.$sessionId').then(m => ({ default: m.WorkoutSessionPage })),
  ),
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
  ]),
  workoutSessionRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

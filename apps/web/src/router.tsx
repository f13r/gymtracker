import { createRouter, createRootRoute, createRoute, Outlet, redirect, lazyRouteComponent } from '@tanstack/react-router';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/dashboard' }); },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('./routes/dashboard').then(m => ({ default: m.DashboardPage }))),
});

const workoutStartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workout/start',
  component: lazyRouteComponent(() => import('./routes/workout.start').then(m => ({ default: m.WorkoutStartPage }))),
});

const workoutSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workout/$sessionId',
  component: lazyRouteComponent(() => import('./routes/workout.$sessionId').then(m => ({ default: m.WorkoutSessionPage }))),
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: lazyRouteComponent(() => import('./routes/history').then(m => ({ default: m.HistoryPage }))),
});

const historyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history/$sessionId',
  component: lazyRouteComponent(() => import('./routes/history.$sessionId').then(m => ({ default: m.HistoryDetailPage }))),
});

const exercisesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exercises',
  component: lazyRouteComponent(() => import('./routes/exercises').then(m => ({ default: m.ExercisesPage }))),
});

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  component: lazyRouteComponent(() => import('./routes/stats').then(m => ({ default: m.StatsPage }))),
});

const bodyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/body',
  component: lazyRouteComponent(() => import('./routes/body').then(m => ({ default: m.BodyPage }))),
});

const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos',
  component: lazyRouteComponent(() => import('./routes/photos').then(m => ({ default: m.PhotosPage }))),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./routes/settings').then(m => ({ default: m.SettingsPage }))),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  workoutStartRoute,
  workoutSessionRoute,
  historyRoute,
  historyDetailRoute,
  exercisesRoute,
  statsRoute,
  bodyRoute,
  photosRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}

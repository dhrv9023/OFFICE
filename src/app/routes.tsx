import type { RouteObject } from 'react-router';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { MeetingsPage } from '@/features/meetings/MeetingsPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import { OfficePage } from '@/features/office/OfficePage';
import { ProjectDetailsPage } from '@/features/projects/ProjectDetailsPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { AppShell } from './AppShell';
import { ROUTES } from './navigation';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: ROUTES.office, element: <OfficePage /> },
      { path: ROUTES.projects, element: <ProjectsPage /> },
      { path: `${ROUTES.projects}/:projectId`, element: <ProjectDetailsPage /> },
      { path: ROUTES.employees, element: <EmployeesPage /> },
      { path: ROUTES.tasks, element: <TasksPage /> },
      { path: ROUTES.meetings, element: <MeetingsPage /> },
      { path: ROUTES.approvals, element: <ApprovalsPage /> },
      { path: ROUTES.activity, element: <ActivityPage /> },
      { path: ROUTES.settings, element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

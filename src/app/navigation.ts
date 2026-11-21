import {
  Activity,
  Building2,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Single source for route paths, used by the router, navigation and links. */
export const ROUTES = {
  dashboard: '/',
  office: '/office',
  projects: '/projects',
  employees: '/employees',
  tasks: '/tasks',
  meetings: '/meetings',
  approvals: '/approvals',
  activity: '/activity',
  settings: '/settings',
} as const;

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** One line shown under the page title. */
  readonly description: string;
  /** Section the page belongs to, used for breadcrumbs. */
  readonly section: string;
}

export interface NavSection {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const item = (
  section: string,
  path: string,
  label: string,
  icon: LucideIcon,
  description: string,
): NavItem => ({ section, path, label, icon, description });

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'Headquarters',
    items: [
      item(
        'Headquarters',
        ROUTES.dashboard,
        'Dashboard',
        LayoutDashboard,
        'How your company is doing right now.',
      ),
      item(
        'Headquarters',
        ROUTES.office,
        'Virtual Office',
        Building2,
        'Your team at work, floor by floor.',
      ),
      item(
        'Headquarters',
        ROUTES.employees,
        'Employees',
        Users,
        'Who works here and what they are doing.',
      ),
      item(
        'Headquarters',
        ROUTES.approvals,
        'Approvals',
        ShieldCheck,
        'Requests from AI employees, and the record of what they did.',
      ),
    ],
  },
  {
    label: 'Work',
    items: [
      item(
        'Work',
        ROUTES.projects,
        'Projects',
        FolderKanban,
        'Everything your company is building.',
      ),
      item('Work', ROUTES.tasks, 'Tasks', ListChecks, 'Every piece of work across all projects.'),
      item(
        'Work',
        ROUTES.meetings,
        'Meetings',
        CalendarDays,
        'Upcoming and past meetings, with their notes.',
      ),
      item('Work', ROUTES.activity, 'Activity', Activity, 'A full history of what has happened.'),
    ],
  },
];

export const SETTINGS_ITEM: NavItem = item(
  'Workspace',
  ROUTES.settings,
  'Settings',
  Settings,
  'Appearance, workspace data and storage.',
);

export const NAV_ITEMS: readonly NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  SETTINGS_ITEM,
];

export function findNavItem(pathname: string): NavItem | undefined {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return NAV_ITEMS.find((navItem) => navItem.path === normalised);
}

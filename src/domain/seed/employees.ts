import type { Employee } from '../types/employee';

/** Fixed timestamp for all seed records, so seeding is reproducible. */
export const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const SEED_EMPLOYEES: readonly Employee[] = [
  {
    id: 'emp_alex_morgan',
    name: 'Alex Morgan',
    role: 'Project Manager',
    departmentId: 'dept_management',
    description:
      'Turns project goals into a plan, breaks work into tasks and keeps delivery on track across departments.',
    skills: ['Project planning', 'Prioritisation', 'Stakeholder communication', 'Risk management'],
    currentTaskId: null,
    deskId: 'desk_management_1',
    avatarId: 'avatar_alex_morgan',
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: 'emp_sarah_chen',
    name: 'Sarah Chen',
    role: 'UI/UX Designer',
    departmentId: 'dept_design',
    description:
      'Designs user flows, wireframes and polished interfaces, and maintains the design system.',
    skills: ['User research', 'Wireframing', 'Visual design', 'Prototyping', 'Design systems'],
    currentTaskId: null,
    deskId: 'desk_design_1',
    avatarId: 'avatar_sarah_chen',
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: 'emp_ryan_miller',
    name: 'Ryan Miller',
    role: 'Frontend Developer',
    departmentId: 'dept_frontend',
    description:
      'Implements designs as accessible, responsive user interfaces and wires them to the backend.',
    skills: ['React', 'TypeScript', 'CSS', 'Accessibility', 'Performance'],
    currentTaskId: null,
    deskId: 'desk_frontend_1',
    avatarId: 'avatar_ryan_miller',
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: 'emp_daniel_kim',
    name: 'Daniel Kim',
    role: 'Backend Developer',
    departmentId: 'dept_backend',
    description:
      'Designs data models and APIs, and builds the services and integrations the product runs on.',
    skills: ['API design', 'Databases', 'Node.js', 'Authentication', 'System design'],
    currentTaskId: null,
    deskId: 'desk_backend_1',
    avatarId: 'avatar_daniel_kim',
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: 'emp_emma_wilson',
    name: 'Emma Wilson',
    role: 'QA Engineer',
    departmentId: 'dept_qa',
    description:
      'Plans and runs tests, reports defects clearly and verifies fixes before anything ships.',
    skills: [
      'Test planning',
      'Manual testing',
      'Test automation',
      'Bug reporting',
      'Regression testing',
    ],
    currentTaskId: null,
    deskId: 'desk_qa_1',
    avatarId: 'avatar_emma_wilson',
    createdAt: SEED_TIMESTAMP,
  },
];

import type { Department } from '../types/department';

/** Colours match the `--hq-dept-*` design tokens in styles/index.css. */
export const SEED_DEPARTMENTS: readonly Department[] = [
  {
    id: 'dept_management',
    name: 'Management',
    description: 'Plans projects, sets priorities and keeps every department moving together.',
    color: '#f5a524',
    roomId: 'room_management',
  },
  {
    id: 'dept_design',
    name: 'UI/UX Design',
    description: 'Researches users and designs the flows, screens and visual language.',
    color: '#e879f9',
    roomId: 'room_design',
  },
  {
    id: 'dept_frontend',
    name: 'Frontend Development',
    description: 'Builds the interfaces people see and use.',
    color: '#38bdf8',
    roomId: 'room_frontend',
  },
  {
    id: 'dept_backend',
    name: 'Backend Development',
    description: 'Builds the services, data models and APIs behind the product.',
    color: '#34d399',
    roomId: 'room_backend',
  },
  {
    id: 'dept_qa',
    name: 'Quality Assurance',
    description: 'Tests the product, tracks defects and signs off on releases.',
    color: '#fb7185',
    roomId: 'room_qa',
  },
];

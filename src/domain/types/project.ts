import type { ProjectId } from '../ids';
import type { Priority } from './priority';

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_CATEGORIES = [
  'web_app',
  'mobile_app',
  'website',
  'api_service',
  'internal_tool',
  'other',
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly description: string;
  readonly category: ProjectCategory;
  /** What the project is meant to achieve. */
  readonly objectives: readonly string[];
  /** What must be true of the result. */
  readonly requirements: readonly string[];
  readonly priority: Priority;
  readonly status: ProjectStatus;
  /** Calendar day `YYYY-MM-DD`, or null when there is no deadline. */
  readonly deadline: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The user-editable part of a project. */
export type ProjectFields = Pick<
  Project,
  | 'name'
  | 'description'
  | 'category'
  | 'objectives'
  | 'requirements'
  | 'priority'
  | 'status'
  | 'deadline'
>;

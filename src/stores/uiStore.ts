import { create } from 'zustand';
import type { EmployeeId, ProjectId } from '@/domain/ids';

/**
 * Transient interface state: what is selected, not what is true about the company.
 * UI code may write this store directly. It holds IDs only — never copies of
 * business entities — and an ID here may outlive its entity, so readers must
 * tolerate a missing lookup.
 */
export interface UiState {
  readonly activeProjectId: ProjectId | null;
  readonly selectedEmployeeId: EmployeeId | null;
  setActiveProject(projectId: ProjectId | null): void;
  selectEmployee(employeeId: EmployeeId | null): void;
  /** Clears every selection. Called when the whole workspace is replaced (import, reset). */
  reset(): void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeProjectId: null,
  selectedEmployeeId: null,
  setActiveProject: (activeProjectId) => {
    set({ activeProjectId });
  },
  selectEmployee: (selectedEmployeeId) => {
    set({ selectedEmployeeId });
  },
  reset: () => {
    set({ activeProjectId: null, selectedEmployeeId: null });
  },
}));

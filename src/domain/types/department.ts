import type { DepartmentId, RoomId } from '../ids';

export interface Department {
  readonly id: DepartmentId;
  readonly name: string;
  readonly description: string;
  /** Hex colour (`#rrggbb`) identifying the department in the UI and the office. */
  readonly color: string;
  /** The department's room in the office layout. */
  readonly roomId: RoomId;
}

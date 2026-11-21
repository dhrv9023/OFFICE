import { conflict } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { validateEmployeeName } from '@/domain/rules/validation';
import type { Employee } from '@/domain/types';
import { activityEvent, checkActor, commit, findEmployee } from '../support';
import type { CommandHandler } from '../types';

export interface RenameEmployeeInput {
  readonly employeeId: EmployeeId;
  /** The new display name. Trimmed; see `validateEmployeeName`. */
  readonly name: string;
}

/**
 * Changes an employee's display name. Only the name changes: the ID, desk,
 * appearance (keyed by `avatarId`) and every task reference stay as they are, so
 * the new name appears wherever the employee is shown. Earlier activity entries
 * keep the name they were written with — the log is history.
 */
export const renameEmployee: CommandHandler<RenameEmployeeInput, Employee> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findEmployee(state, input.employeeId);
  if (!found.ok) return found;
  const current = found.value;

  const name = validateEmployeeName(input.name);
  if (!name.ok) return name;
  if (name.value === current.name) {
    return err(conflict('no_change', `${current.name} already has this name.`));
  }

  const now = context.clock.now();
  const employee: Employee = { ...current, name: name.value };
  return ok({
    value: employee,
    state: commit(
      state,
      { employees: { ...state.employees, [employee.id]: employee } },
      [
        activityEvent(context, now, {
          eventType: 'employee.renamed',
          description: `${current.name} was renamed to ${employee.name}.`,
          employeeId: employee.id,
        }),
      ],
      [],
    ),
  });
};

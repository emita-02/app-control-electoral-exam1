import type {
  PersonnelRepository,
  SaveWatcherAssignmentsInput,
} from '@/features/personnel/domain/personnel';

export async function saveWatcherAssignments(
  repository: PersonnelRepository,
  input: SaveWatcherAssignmentsInput,
): Promise<void> {
  const tableIds = [...new Set(input.electoralTableIds)];
  if (!input.watcherId.trim()) {
    throw new Error('Selecciona un veedor.');
  }
  if (
    tableIds.length === 0 ||
    tableIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new Error('Selecciona una o más mesas válidas.');
  }
  if (
    input.replacingWatcherId &&
    input.replacingWatcherId === input.watcherId
  ) {
    throw new Error('El veedor nuevo debe ser diferente al veedor reemplazado.');
  }

  const endReason = input.endReason?.trim();
  if (input.replacingWatcherId && !endReason) {
    throw new Error('Indica el motivo del reemplazo.');
  }

  await repository.saveAssignments({
    ...input,
    electoralTableIds: tableIds,
    endReason,
  });
}

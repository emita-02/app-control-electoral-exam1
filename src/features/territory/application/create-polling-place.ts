import type {
  CreatePollingPlaceInput,
  PollingPlace,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';

export async function createPollingPlace(
  repository: ProvinceTerritoryRepository,
  input: CreatePollingPlaceInput,
): Promise<PollingPlace> {
  if (!Number.isSafeInteger(input.parishId) || input.parishId <= 0) {
    throw new Error('Selecciona una parroquia válida.');
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('Ingresa el nombre del recinto.');
  }

  return repository.createPollingPlace({
    parishId: input.parishId,
    name,
    code: input.code?.trim() || null,
    address: input.address?.trim() || null,
  });
}

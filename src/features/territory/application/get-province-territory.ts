import type {
  ProvinceTerritory,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';

export async function getProvinceTerritory(
  repository: ProvinceTerritoryRepository,
  provinceId: number,
): Promise<ProvinceTerritory> {
  if (!Number.isSafeInteger(provinceId)) {
    throw new Error('La provincia asignada al perfil no es válida.');
  }

  return repository.findByProvinceId(provinceId);
}

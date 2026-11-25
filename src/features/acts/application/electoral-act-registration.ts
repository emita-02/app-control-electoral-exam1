import type {
  ElectoralActCatalog,
  ElectoralActRepository,
} from '@/features/acts/domain/electoral-act-registration';

export async function loadElectoralActCatalog(
  repository: ElectoralActRepository,
  watcherId: string,
): Promise<ElectoralActCatalog> {
  return repository.loadCatalog(watcherId);
}

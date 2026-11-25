/** Estados usados por el backend para el ciclo de vida de un acta electoral. */
export const APPROVED_ACT_STATUS = 'aprobada';
export const PENDING_REVIEW_ACT_STATUS = 'pendiente_revision';

/**
 * Solo las actas aprobadas por una persona pueden alimentar resultados
 * oficiales, avances y evidencia del panel (S-06).
 */
export function isApprovedActStatus(status: string): boolean {
  return status.trim().toLowerCase() === APPROVED_ACT_STATUS;
}

import type {
  ActOcrRepository,
  ActOcrRequest,
  ActOcrResult,
} from '../domain/act-ocr';

export async function processActOcr(
  repository: ActOcrRepository,
  input: ActOcrRequest,
  signal?: AbortSignal,
): Promise<ActOcrResult> {
  if (
    !Number.isSafeInteger(input.actId) ||
    input.actId <= 0 ||
    !Number.isSafeInteger(input.evidenceId) ||
    input.evidenceId <= 0
  ) {
    throw new Error('No se pudo identificar el acta y su evidencia.');
  }

  return repository.process(input, signal);
}

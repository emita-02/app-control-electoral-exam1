import {
  parseActOcrResult,
  type ActOcrRepository,
  type ActOcrRequest,
  type ActOcrResult,
} from '@/features/acts/domain/act-ocr';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getFunctionErrorMessage(error: {
  name: string;
  context: unknown;
}): Promise<string> {
  if (error.context instanceof Response) {
    if (error.context.status === 504) {
      return 'El reconocimiento tardó demasiado. Comprueba tu conexión e inténtalo nuevamente.';
    }

    try {
      const body: unknown = await error.context.clone().json();
      if (isRecord(body) && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      return `El servicio de reconocimiento respondió con HTTP ${error.context.status}.`;
    }

    return `El servicio de reconocimiento respondió con HTTP ${error.context.status}.`;
  }

  if (error.name === 'FunctionsFetchError') {
    return 'No se pudo contactar el servicio OCR. Comprueba tu conexión e inténtalo nuevamente.';
  }
  if (error.name === 'FunctionsRelayError') {
    return 'El servicio OCR no está disponible temporalmente. Inténtalo nuevamente más tarde.';
  }

  return 'No se pudo completar el reconocimiento del acta.';
}

export class SupabaseActOcrRepository implements ActOcrRepository {
  async process(
    input: ActOcrRequest,
    signal?: AbortSignal,
  ): Promise<ActOcrResult> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { data, error } = await supabase.functions.invoke<unknown>(
      'procesar-acta-ocr',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          actId: input.actId,
          evidenceId: input.evidenceId,
        },
        signal,
      },
    );

    if (error) {
      throw new Error(await getFunctionErrorMessage(error));
    }

    return parseActOcrResult(data, input);
  }
}

import { supabase } from '@/features/auth/infrastructure/supabase-client';
import type {
  ExitPollRepository,
  RegisterExitPollInput,
  RegisteredExitPollResponse,
} from '@/features/dashboard/domain/exit-poll';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SupabaseExitPollRepository implements ExitPollRepository {
  async register(
    input: RegisterExitPollInput,
  ): Promise<RegisteredExitPollResponse> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { data, error } = await supabase.functions.invoke<unknown>(
      'registrar-encuesta',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: input,
      },
    );

    if (error) {
      if (error.context instanceof Response) {
        throw new Error(
          `El servicio del Exit Poll respondió con HTTP ${error.context.status}.`,
        );
      }
      throw new Error('No se pudo registrar la respuesta del Exit Poll.');
    }
    if (!isRecord(data) || typeof data.error === 'string') {
      throw new Error(
        isRecord(data) && typeof data.error === 'string'
          ? data.error
          : 'El servidor no confirmó la respuesta del Exit Poll.',
      );
    }
    if (
      data.success !== true ||
      typeof data.responseId !== 'number' ||
      typeof data.createdAt !== 'string'
    ) {
      throw new Error('El servidor devolvió una respuesta inesperada.');
    }

    return {
      responseId: data.responseId,
      createdAt: data.createdAt,
    };
  }
}

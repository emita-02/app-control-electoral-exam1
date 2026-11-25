import type {
  ActConfirmationRepository,
  ConfirmActInput,
  ConfirmActResult,
} from '@/features/acts/domain/act-confirmation';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFunctionError(error: { name?: string; context?: unknown }): string {
  if (error.context instanceof Response) {
    return `El servicio de confirmación respondió con HTTP ${error.context.status}.`;
  }
  if (error.name === 'FunctionsFetchError') {
    return 'No se pudo contactar el servicio de confirmación. Comprueba tu conexión.';
  }
  return 'No se pudo confirmar el acta.';
}

export class SupabaseActConfirmationRepository
  implements ActConfirmationRepository
{
  async confirm(input: ConfirmActInput): Promise<ConfirmActResult> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { data, error } = await supabase.functions.invoke<unknown>(
      'confirmar-resultados',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          action: input.action,
          actId: input.actId,
          candidateVotes: input.candidateVotes,
          blankVotes: input.blankVotes,
          nullVotes: input.nullVotes,
          totalVotes: input.totalVotes,
          observation: input.observation,
          reason: input.reason,
          ocrData: input.ocrData ?? null,
        },
      },
    );

    if (error) {
      throw new Error(readFunctionError(error));
    }
    if (!isRecord(data)) {
      throw new Error('El servidor no confirmó el acta.');
    }
    if (typeof data.error === 'string') {
      throw new Error(data.error);
    }
    if (
      data.success !== true ||
      typeof data.actId !== 'number' ||
      typeof data.status !== 'string' ||
      typeof data.reviewedAt !== 'string'
    ) {
      throw new Error('El servidor devolvió una confirmación inesperada.');
    }

    return {
      actId: data.actId,
      status: data.status,
      reviewedAt: data.reviewedAt,
      correctionRegistered: data.correctionRegistered === true,
    };
  }
}

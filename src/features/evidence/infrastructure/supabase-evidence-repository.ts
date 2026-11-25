import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type {
  EvidenceRepository,
  EvidenceUploadInput,
  UploadedEvidence,
} from '@/features/evidence/domain/evidence-persistence';
import { evidenceStorageBucket } from '@/features/evidence/infrastructure/evidence-storage-config';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

function createObjectName(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readFunctionError(error: { name?: string; context?: unknown }): string {
  if (error.context instanceof Response) {
    return `El servicio de evidencias respondió con HTTP ${error.context.status}.`;
  }
  if (error.name === 'FunctionsFetchError') {
    return 'No se pudo contactar el servicio de evidencias. Comprueba tu conexión.';
  }
  return 'No se pudo registrar la evidencia.';
}

export class SupabaseEvidenceRepository implements EvidenceRepository {
  async upload(input: EvidenceUploadInput): Promise<UploadedEvidence> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const manipulated = await ImageManipulator.manipulate(input.localUri)
      .renderAsync();
    const compressed = await manipulated.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.85,
      base64: true,
    });
    if (!compressed.base64) {
      throw new Error('No se pudo preparar la fotografía para su carga.');
    }

    const storagePath = `${input.actId}/${createObjectName()}.jpg`;
    const bytes = base64ToBytes(compressed.base64);
    const { error: uploadError } = await supabase.storage
      .from(evidenceStorageBucket)
      .upload(storagePath, bytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        'No se pudo cargar la fotografía al almacenamiento seguro. Verifica tu conexión e inténtalo nuevamente.',
      );
    }

    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      evidenceId?: number;
      storagePath?: string;
      error?: string;
    }>('registrar-evidencia', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        actId: input.actId,
        storagePath,
        latitude: input.latitude,
        longitude: input.longitude,
        capturedAt: input.capturedAt,
      },
    });

    if (error) {
      throw new Error(readFunctionError(error));
    }
    if (
      !data?.success ||
      typeof data.evidenceId !== 'number' ||
      typeof data.storagePath !== 'string'
    ) {
      throw new Error(data?.error ?? 'No se pudo confirmar la evidencia cargada.');
    }

    return {
      actId: input.actId,
      evidenceId: data.evidenceId,
      storagePath: data.storagePath,
    };
  }
}

import { Directory, File, Paths } from 'expo-file-system';

import type { EvidenceFileStore } from '@/features/evidence/domain/evidence-file-store';

const evidenceDirectory = new Directory(Paths.document, 'evidence');

function createFileName(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${globalThis.crypto.randomUUID()}.jpg`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
}

export class ExpoEvidenceFileStore implements EvidenceFileStore {
  async persist(localUri: string): Promise<string> {
    if (!localUri.trim()) {
      throw new Error('La fotografía capturada no tiene una ruta válida.');
    }

    const source = new File(localUri);
    if (!source.exists) {
      throw new Error('No se encontró la fotografía capturada en el dispositivo.');
    }

    evidenceDirectory.create({ intermediates: true, idempotent: true });
    const destination = new File(evidenceDirectory, createFileName());
    await source.copy(destination);
    return destination.uri;
  }
}

export type EvidenceCoordinates = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type CapturedEvidence = {
  /** Acta a la que pertenece la fotografía. Evita asociar una captura a otra acta. */
  actId: number;
  userId: string;
  localUri: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  sharpnessScore: number;
};

export type EvidenceCaptureInput = {
  actId: number;
  userId: string;
  localUri: string;
  capturedAt: string;
};

/** Una fotografía solo puede registrarse en el acta para la que fue capturada. */
export function captureBelongsToAct(
  capture: Pick<CapturedEvidence, 'actId'>,
  actId: number,
): boolean {
  return capture.actId === actId;
}

export const maximumLocationAgeAtCaptureMs = 5_000;

export type EvidenceCaptureErrorCode =
  | 'invalid_capture'
  | 'image_blurry'
  | 'image_analysis_failed'
  | 'location_permission_denied'
  | 'location_unavailable'
  | 'location_invalid'
  | 'location_stale';

const errorMessages: Record<EvidenceCaptureErrorCode, string> = {
  invalid_capture: 'No se pudo identificar la fotografía o la cuenta actual.',
  image_blurry:
    'La fotografía está borrosa. Estabiliza el dispositivo y vuelve a tomarla.',
  image_analysis_failed:
    'No se pudo analizar la nitidez. Intenta tomar la fotografía nuevamente.',
  location_permission_denied:
    'El permiso de ubicación no está disponible. Habilítalo en la configuración del dispositivo.',
  location_unavailable:
    'No se pudo obtener una ubicación GPS actual. Verifica los servicios de ubicación e inténtalo nuevamente.',
  location_invalid:
    'El dispositivo devolvió coordenadas GPS no válidas. Toma otra fotografía.',
  location_stale:
    'La ubicación GPS recibida no corresponde al momento de la captura. Toma otra fotografía.',
};

export class EvidenceCaptureError extends Error {
  readonly code: EvidenceCaptureErrorCode;

  constructor(code: EvidenceCaptureErrorCode) {
    super(errorMessages[code]);
    this.name = 'EvidenceCaptureError';
    this.code = code;
  }
}

export function validateCurrentEvidenceLocation(
  coordinates: EvidenceCoordinates,
  capturedAtMilliseconds: number,
): void {
  if (
    !Number.isFinite(coordinates.latitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new EvidenceCaptureError('location_invalid');
  }

  const locationAge = Math.abs(
    coordinates.timestamp - capturedAtMilliseconds,
  );
  if (
    !Number.isFinite(locationAge) ||
    locationAge > maximumLocationAgeAtCaptureMs
  ) {
    throw new EvidenceCaptureError('location_stale');
  }
}

export interface ImageSharpnessAnalyzer {
  measure(uri: string): Promise<number>;
}

export interface CurrentLocationProvider {
  getCurrentCoordinates(): Promise<EvidenceCoordinates>;
}

export interface EvidenceStorageRepository {
  upload(input: { localUri: string; objectPath: string }): Promise<string>;
}

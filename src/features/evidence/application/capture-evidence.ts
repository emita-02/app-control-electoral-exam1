import {
  EvidenceCaptureError,
  validateCurrentEvidenceLocation,
  type CapturedEvidence,
  type CurrentLocationProvider,
  type EvidenceCaptureInput,
  type ImageSharpnessAnalyzer,
} from '@/features/evidence/domain/evidence';
import { minimumSharpnessScore } from '@/features/evidence/domain/sharpness-score';

export type EvidenceCaptureDependencies = {
  imageSharpnessAnalyzer: ImageSharpnessAnalyzer;
  currentLocationProvider: CurrentLocationProvider;
};

export async function captureEvidence(
  dependencies: EvidenceCaptureDependencies,
  input: EvidenceCaptureInput,
): Promise<CapturedEvidence> {
  const capturedAtMilliseconds = Date.parse(input.capturedAt);
  if (
    !input.userId.trim() ||
    !input.localUri.trim() ||
    !Number.isFinite(capturedAtMilliseconds)
  ) {
    throw new EvidenceCaptureError('invalid_capture');
  }

  const sharpnessScore = await dependencies.imageSharpnessAnalyzer.measure(
    input.localUri,
  );
  if (
    !Number.isFinite(sharpnessScore) ||
    sharpnessScore < minimumSharpnessScore
  ) {
    throw new EvidenceCaptureError('image_blurry');
  }

  const coordinates =
    await dependencies.currentLocationProvider.getCurrentCoordinates();
  validateCurrentEvidenceLocation(coordinates, capturedAtMilliseconds);

  return {
    ...input,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    sharpnessScore,
  };
}

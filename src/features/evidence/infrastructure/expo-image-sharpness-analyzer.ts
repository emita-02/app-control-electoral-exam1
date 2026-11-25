import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import {
  EvidenceCaptureError,
  type ImageSharpnessAnalyzer,
} from '@/features/evidence/domain/evidence';
import { calculateLaplacianVariance } from '@/features/evidence/domain/sharpness-score';

const analysisImageWidth = 320;

export class ExpoImageSharpnessAnalyzer implements ImageSharpnessAnalyzer {
  async measure(uri: string): Promise<number> {
    try {
      const image = await ImageManipulator.manipulate(uri)
        .resize({ width: analysisImageWidth })
        .renderAsync();
      const result = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 1,
        base64: true,
      });

      if (!result.base64) {
        throw new EvidenceCaptureError('image_analysis_failed');
      }

      const binary = globalThis.atob(result.base64);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      const decoded = decode(bytes, { useTArray: true });
      return calculateLaplacianVariance(
        decoded.data,
        decoded.width,
        decoded.height,
      );
    } catch (error) {
      if (error instanceof EvidenceCaptureError) {
        throw error;
      }
      throw new EvidenceCaptureError('image_analysis_failed');
    }
  }
}

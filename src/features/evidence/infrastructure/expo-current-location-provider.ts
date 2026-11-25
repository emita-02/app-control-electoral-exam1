import * as Location from 'expo-location';

import {
  EvidenceCaptureError,
  type CurrentLocationProvider,
  type EvidenceCoordinates,
} from '@/features/evidence/domain/evidence';

export class ExpoCurrentLocationProvider implements CurrentLocationProvider {
  async getCurrentCoordinates(): Promise<EvidenceCoordinates> {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new EvidenceCaptureError('location_permission_denied');
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        throw new EvidenceCaptureError('location_unavailable');
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: position.timestamp,
      };
    } catch (error) {
      if (error instanceof EvidenceCaptureError) {
        throw error;
      }
      throw new EvidenceCaptureError('location_unavailable');
    }
  }
}

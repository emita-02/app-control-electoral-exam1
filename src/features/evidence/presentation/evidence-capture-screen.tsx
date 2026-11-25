import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AuthHeading,
  AuthNotice,
  AuthShell,
  PrimaryButton,
} from '@/features/auth/presentation/components/auth-ui';
import {
  captureEvidence,
  clearEvidenceCaptureError,
  clearEvidenceUploadResult,
  uploadEvidenceForAct,
  type UploadEvidenceInput,
} from '@/features/evidence/presentation/evidence-slice';
import type { WorkspaceStackParamList } from '@/navigation/types';
import { useAppDispatch, useAppSelector } from '@/store/store';

export function EvidenceCaptureScreen({
  navigation,
  route,
}: NativeStackScreenProps<WorkspaceStackParamList, 'EvidenceCapture'>) {
  const dispatch = useAppDispatch();
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const profile = useAppSelector((state) => state.auth.profile);
  const { actId } = route.params;
  const { captures, captureError, captureStatus, uploadError, uploadStatus } =
    useAppSelector((state) => state.evidence);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [settingsRequired, setSettingsRequired] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const requestLocationAccess = async () => {
    setPermissionError(null);
    setSettingsRequired(false);
    setLocationReady(false);

    const location = await Location.requestForegroundPermissionsAsync();
    if (!location.granted) {
      setPermissionError(
        'Se necesita permiso de ubicación para registrar las coordenadas de la fotografía.',
      );
      setSettingsRequired(!location.canAskAgain);
      return;
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      setPermissionError(
        'Los servicios de ubicación están desactivados. Actívalos en el dispositivo y vuelve a intentarlo.',
      );
      return;
    }

    setLocationReady(true);
  };

  const enableCapture = async () => {
    setPermissionBusy(true);
    setPermissionError(null);
    setSettingsRequired(false);

    try {
      const currentCameraPermission = await getCameraPermission();
      const camera = currentCameraPermission.granted
        ? currentCameraPermission
        : await requestCameraPermission();
      if (!camera.granted) {
        setPermissionError(
          'Se necesita permiso de cámara para fotografiar el acta.',
        );
        setSettingsRequired(!camera.canAskAgain);
        return;
      }

      setCameraReady(false);
      setCameraEnabled(true);
      await requestLocationAccess();
    } catch (error) {
      setPermissionError(
        error instanceof Error
          ? error.message
          : 'No se pudieron comprobar los permisos y servicios del dispositivo.',
      );
    } finally {
      setPermissionBusy(false);
    }
  };

  const retryLocationAccess = async () => {
    setPermissionBusy(true);
    try {
      await requestLocationAccess();
    } catch (error) {
      setPermissionError(
        error instanceof Error
          ? error.message
          : 'No se pudieron comprobar los permisos y servicios de ubicación.',
      );
    } finally {
      setPermissionBusy(false);
    }
  };

  const takePhoto = async () => {
    if (!profile || !cameraRef.current) {
      setPermissionError(
        'La cámara o la sesión actual no están listas. Inténtalo nuevamente.',
      );
      return;
    }

    dispatch(clearEvidenceCaptureError());
    dispatch(clearEvidenceUploadResult());
    setPermissionError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!photo.uri) {
        setPermissionError('La cámara no devolvió un archivo de fotografía.');
        return;
      }

      const capturedAt = new Date().toISOString();
      setCameraReady(false);
      setPreviewUri(photo.uri);

      await dispatch(
        captureEvidence({
          userId: profile.id,
          localUri: photo.uri,
          capturedAt,
        }),
      );
    } catch (error) {
      setPermissionError(
        error instanceof Error
          ? error.message
          : 'No se pudo tomar la fotografía. Inténtalo nuevamente.',
      );
    }
  };

  const retakePhoto = () => {
    dispatch(clearEvidenceCaptureError());
    dispatch(clearEvidenceUploadResult());
    setPermissionError(null);
    setPreviewUri(null);
    setCameraReady(false);
  };

  const registerEvidence = async (capture: UploadEvidenceInput) => {
    dispatch(clearEvidenceUploadResult());
    try {
      const result = await dispatch(uploadEvidenceForAct(capture)).unwrap();
      if (result.savedOffline) {
        navigation.navigate('OfflineHistory');
        return;
      }
      navigation.navigate('ActOcrReview', {
        actId: result.actId,
        evidenceId: result.evidenceId,
      });
    } catch {
      // El mensaje se muestra desde `state.evidence.uploadError`.
    }
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      setPermissionError(
        error instanceof Error
          ? error.message
          : 'No se pudo abrir la configuración del dispositivo.',
      );
    }
  };

  return (
    <AuthShell>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() => navigation.goBack()}>
        <Text className="text-base font-semibold text-electoral-navy">
          Volver al inicio
        </Text>
      </Pressable>
      <AuthHeading
        title="Evidencia fotográfica"
        description={`Toma una fotografía del acta ${actId}. La aplicación comprobará la nitidez y obtendrá una ubicación GPS actual; no se puede elegir una imagen de la galería.`}
      />

      {permissionError ? <AuthNotice message={permissionError} /> : null}
      {captureError ? <AuthNotice message={captureError} /> : null}
      {uploadError ? <AuthNotice message={uploadError} /> : null}
      {uploadStatus === 'loading' ? (
        <AuthNotice message="Registrando la evidencia…" />
      ) : null}

      {settingsRequired ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl border border-electoral-border bg-white px-4"
          onPress={() => void openSettings()}>
          <Text className="text-base font-semibold text-electoral-navy">
            Abrir configuración
          </Text>
        </Pressable>
      ) : null}

      {!cameraEnabled ? (
        <PrimaryButton
          label="Permitir cámara y ubicación"
          loading={permissionBusy}
          onPress={() => void enableCapture()}
        />
      ) : previewUri ? (
        <>
          <Image
            accessibilityLabel="Vista previa de la fotografía del acta"
            className="h-80 w-full rounded-xl"
            resizeMode="contain"
            source={{ uri: previewUri }}
          />
          {captureStatus === 'loading' ? (
            <Text className="text-center text-sm text-electoral-muted">
              Verificando nitidez y ubicación GPS…
            </Text>
          ) : null}
          {captureStatus === 'succeeded' ? (
            <AuthNotice
              message="La fotografía superó la validación y se agregó como evidencia."
              success
            />
          ) : null}
          <PrimaryButton
            label={
              captureStatus === 'failed'
                ? 'Repetir fotografía'
                : 'Tomar otra fotografía'
            }
            disabled={captureStatus === 'loading'}
            onPress={retakePhoto}
          />
        </>
      ) : (
        <>
          <View className="h-80 w-full overflow-hidden rounded-xl bg-electoral-navy">
            <CameraView
              ref={cameraRef}
              style={{ width: '100%', height: '100%' }}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
              onMountError={(event) => {
                setPermissionError(
                  `No se pudo iniciar la cámara: ${event.message}`,
                );
                setCameraEnabled(false);
                setCameraReady(false);
              }}
            />
          </View>
          {!cameraReady ? (
            <View className="items-center gap-2">
              <ActivityIndicator color="#00AEEF" />
              <Text className="text-sm text-electoral-muted">
                Iniciando cámara…
              </Text>
            </View>
          ) : null}
          {cameraEnabled && !locationReady && !permissionError ? (
            <AuthNotice
              message={
                permissionBusy
                  ? 'Comprobando permiso y servicios de ubicación…'
                  : 'Habilita la ubicación para activar la captura.'
              }
            />
          ) : null}
          {cameraEnabled && !locationReady && !permissionBusy ? (
            <PrimaryButton
              label="Reintentar ubicación"
              onPress={() => void retryLocationAccess()}
            />
          ) : null}
          <PrimaryButton
            label="Tomar fotografía"
            loading={captureStatus === 'loading' || permissionBusy}
            disabled={!cameraReady || !locationReady}
            onPress={() => void takePhoto()}
          />
        </>
      )}

      {captures.length > 0 ? (
        <View className="gap-4">
          <Text className="text-lg font-bold text-electoral-navy">
            Fotografías capturadas
          </Text>
          {captures.map((capture, index) => (
            <View
              key={capture.localUri}
              className="gap-3 rounded-xl border border-electoral-border bg-white p-4">
              <Image
                accessibilityLabel="Fotografía capturada del acta"
                className="h-40 w-full rounded-lg"
                resizeMode="cover"
                source={{ uri: capture.localUri }}
              />
              <Text className="text-sm text-electoral-text">
                Capturada: {new Date(capture.capturedAt).toLocaleString('es-EC')}
              </Text>
              <Text className="text-sm text-electoral-text">
                Ubicación: {capture.latitude.toFixed(6)}, {capture.longitude.toFixed(6)}
              </Text>
              <Text className="text-sm text-electoral-muted">
                Nitidez verificada · Referencia local guardada en el dispositivo.
              </Text>
              {index === 0 ? (
                <PrimaryButton
                  label="Registrar evidencia y continuar"
                  loading={uploadStatus === 'loading'}
                  disabled={uploadStatus === 'loading'}
                  onPress={() => void registerEvidence({ ...capture, actId })}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </AuthShell>
  );
}

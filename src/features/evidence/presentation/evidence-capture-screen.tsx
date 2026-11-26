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
  AppShell,
  AuthNotice,
  PrimaryButton,
  RoleHeader,
  StatusBadge,
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
  const allCaptures = useAppSelector((state) => state.evidence.captures);
  const {
    captureError,
    captureStatus,
    uploadError,
    uploadStatus,
    uploadedEvidence,
  } = useAppSelector((state) => state.evidence);
  // Solo se pueden registrar fotografías tomadas para esta acta.
  const captures = allCaptures.filter((capture) => capture.actId === actId);
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
          actId,
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
      // La fotografía se guarda y el flujo termina aquí. El flujo OCR (F08)
      // permanece en el código, pero la captura ya no navega a su revisión.
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
    <AppShell
      header={
        <RoleHeader
          badge={actId < 0 ? 'Acta local' : `Acta #${actId}`}
          title="Evidencia fotográfica"
          subtitle="Captura directa con cámara, control de nitidez y sello GPS."
          onBack={() => navigation.goBack()}
          backLabel="Inicio"
        />
      }>
      {permissionError ? <AuthNotice message={permissionError} /> : null}
      {captureError ? <AuthNotice message={captureError} /> : null}
      {uploadError ? <AuthNotice message={uploadError} /> : null}
      {uploadStatus === 'loading' ? (
        <AuthNotice success message="Subiendo y registrando evidencia segura…" />
      ) : null}
      {uploadedEvidence ? (
        <AuthNotice
          success
          message="Fotografía guardada correctamente."
        />
      ) : null}

      {settingsRequired ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-2xl border-2 border-electoral-navy bg-white px-4"
          onPress={() => void openSettings()}>
          <Text className="text-sm font-extrabold text-electoral-navy">
            Abrir configuración del dispositivo
          </Text>
        </Pressable>
      ) : null}

      {!cameraEnabled ? (
        <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-5 shadow-xs">
          <StatusBadge label="Cámara directa obligatoria" tone="cyan" />
          <Text className="text-base font-extrabold text-electoral-navy">
            Preparar captura del acta física
          </Text>
          <Text className="text-sm leading-5 text-electoral-muted">
            La aplicación verificará automáticamente que la imagen sea legible y asociará tus coordenadas GPS actuales.
          </Text>
          <PrimaryButton
            label="Activar cámara y ubicación"
            loading={permissionBusy}
            onPress={() => void enableCapture()}
          />
        </View>
      ) : previewUri ? (
        <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-4 shadow-xs">
          <Image
            accessibilityLabel="Vista previa de la fotografía del acta"
            className="h-80 w-full rounded-xl bg-slate-100"
            resizeMode="contain"
            source={{ uri: previewUri }}
          />
          {captureStatus === 'loading' ? (
            <View className="flex-row items-center justify-center gap-2 py-2">
              <ActivityIndicator color="#00AEEF" />
              <Text className="text-sm font-semibold text-electoral-navy">
                Analizando nitidez y ubicación GPS…
              </Text>
            </View>
          ) : null}
          {captureStatus === 'succeeded' ? (
            <AuthNotice
              message="Fotografía nítida verificada y agregada como evidencia."
              success
            />
          ) : null}
          <PrimaryButton
            label={
              captureStatus === 'failed'
                ? 'Repetir fotografía'
                : 'Tomar otra fotografía'
            }
            variant="secondary"
            disabled={captureStatus === 'loading'}
            onPress={retakePhoto}
          />
        </View>
      ) : (
        <View className="gap-4 rounded-2xl border border-electoral-border bg-white p-4 shadow-xs">
          <View className="h-80 w-full overflow-hidden rounded-2xl border-2 border-electoral-cyan bg-electoral-navy">
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
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#00AEEF" />
              <Text className="text-sm font-medium text-electoral-muted">
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
              variant="secondary"
              onPress={() => void retryLocationAccess()}
            />
          ) : null}
          <PrimaryButton
            label="Capturar fotografía"
            loading={captureStatus === 'loading' || permissionBusy}
            disabled={!cameraReady || !locationReady}
            onPress={() => void takePhoto()}
          />
        </View>
      )}

      {captures.length > 0 ? (
        <View className="gap-3">
          <Text className="px-1 text-base font-extrabold text-electoral-navy">
            Fotografías verificadas ({captures.length})
          </Text>
          {captures.map((capture) => (
            <View
              key={capture.localUri}
              className="gap-3 rounded-2xl border border-electoral-border bg-white p-4 shadow-xs">
              <Image
                accessibilityLabel={`Fotografía capturada del acta ${capture.actId}`}
                className="h-44 w-full rounded-xl"
                resizeMode="cover"
                source={{ uri: capture.localUri }}
              />
              <View className="flex-row flex-wrap gap-2">
                <StatusBadge label="Nitidez OK" tone="cyan" />
                <StatusBadge
                  label={`GPS: ${capture.latitude.toFixed(4)}, ${capture.longitude.toFixed(4)}`}
                  tone="navy"
                />
              </View>
              <Text className="text-xs text-electoral-muted">
                Capturada: {new Date(capture.capturedAt).toLocaleString('es-EC')}
              </Text>
              <PrimaryButton
                label="Guardar fotografía"
                loading={uploadStatus === 'loading'}
                disabled={uploadStatus === 'loading'}
                onPress={() => void registerEvidence(capture)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </AppShell>
  );
}
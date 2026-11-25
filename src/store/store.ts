import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { UserProfile } from '@/features/auth/domain/user-profile';
import authReducer from '@/features/auth/presentation/auth-slice';
import { SupabaseTerritoryRepository } from '@/features/territory/infrastructure/supabase-territory-repository';
import territoryReducer from '@/features/territory/presentation/territory-slice';
import { SupabasePersonnelRepository } from '@/features/personnel/infrastructure/supabase-personnel-repository';
import personnelReducer from '@/features/personnel/presentation/personnel-slice';
import { ExpoImageSharpnessAnalyzer } from '@/features/evidence/infrastructure/expo-image-sharpness-analyzer';
import { ExpoCurrentLocationProvider } from '@/features/evidence/infrastructure/expo-current-location-provider';
import { ExpoEvidenceFileStore } from '@/features/evidence/infrastructure/expo-evidence-file-store';
import { SupabaseEvidenceRepository } from '@/features/evidence/infrastructure/supabase-evidence-repository';
import evidenceReducer from '@/features/evidence/presentation/evidence-slice';
import { SupabaseActOcrRepository } from '@/features/acts/infrastructure/supabase-act-ocr-repository';
import actOcrReducer from '@/features/acts/presentation/act-ocr-slice';
import { SupabaseElectoralActRepository } from '@/features/acts/infrastructure/supabase-electoral-act-repository';
import actRegistrationReducer from '@/features/acts/presentation/act-registration-slice';
import { SupabaseActConfirmationRepository } from '@/features/acts/infrastructure/supabase-act-confirmation-repository';
import actConfirmationReducer from '@/features/acts/presentation/act-confirmation-slice';
import { SupabaseActCorrectionRepository } from '@/features/acts/infrastructure/supabase-act-correction-repository';
import actCorrectionReducer from '@/features/acts/presentation/act-correction-slice';
import { SupabaseExitPollRepository } from '@/features/dashboard/infrastructure/supabase-exit-poll-repository';
import { SupabaseDashboardRepository } from '@/features/dashboard/infrastructure/supabase-dashboard-repository';
import dashboardReducer from '@/features/dashboard/presentation/dashboard-slice';
import { SQLiteOfflineQueue } from '@/features/offline/infrastructure/sqlite-offline-queue';
import { NetInfoNetworkStatus } from '@/features/offline/infrastructure/netinfo-network-status';
import { OfflineSyncWorker } from '@/features/offline/application/sync-worker';
import offlineReducer from '@/features/offline/presentation/offline-slice';
import { FirebaseCrashlyticsErrorReporter } from '@/features/monitoring/infrastructure/firebase-crashlytics-error-reporter';

const territoryRepository = new SupabaseTerritoryRepository();
const actOcrRepository = new SupabaseActOcrRepository();
const electoralActRepository = new SupabaseElectoralActRepository();
const confirmationRepository = new SupabaseActConfirmationRepository();
const actCorrectionRepository = new SupabaseActCorrectionRepository();
const evidenceRepository = new SupabaseEvidenceRepository();
const exitPollRepository = new SupabaseExitPollRepository();
const queue = new SQLiteOfflineQueue();
const networkStatus = new NetInfoNetworkStatus();
const errorReporter = new FirebaseCrashlyticsErrorReporter();

const syncWorker = new OfflineSyncWorker({
  queue,
  networkStatus,
  electoralActRepository,
  evidenceRepository,
  confirmationRepository,
  exitPollRepository,
  actOcrRepository,
  errorReporter,
});

const evidenceCaptureDependencies = {
  imageSharpnessAnalyzer: new ExpoImageSharpnessAnalyzer(),
  currentLocationProvider: new ExpoCurrentLocationProvider(),
};
const evidenceFileStore = new ExpoEvidenceFileStore();

export const store = configureStore({
  reducer: {
    auth: authReducer,
    territory: territoryReducer,
    personnel: personnelReducer,
    evidence: evidenceReducer,
    actOcr: actOcrReducer,
    actRegistration: actRegistrationReducer,
    actConfirmation: actConfirmationReducer,
    actCorrection: actCorrectionReducer,
    dashboard: dashboardReducer,
    offline: offlineReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: {
        extraArgument: {
          territoryRepository,
          personnelRepository: new SupabasePersonnelRepository(territoryRepository),
          actOcrRepository,
          electoralActRepository,
          evidenceCaptureDependencies,
          evidenceFileStore,
          evidenceRepository,
          confirmationRepository,
          actCorrectionRepository,
          exitPollRepository,
          createDashboardRepository: (profile: UserProfile) =>
            new SupabaseDashboardRepository(profile),
          queue,
          networkStatus,
          errorReporter,
          syncWorker,
        },
      },
    }),
});

export const appDependencies = {
  queue,
  networkStatus,
  errorReporter,
};

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

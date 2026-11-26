import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import ForgotPasswordScreen from '@/features/auth/presentation/screens/forgot-password-screen';
import LoginScreen from '@/features/auth/presentation/screens/login-screen';
import ResetPasswordScreen from '@/features/auth/presentation/screens/reset-password-screen';
import { RoleHome } from '@/features/auth/presentation/role-home';
import { userRoles } from '@/features/auth/domain/user-profile';
import { LoadingScreen } from '@/features/auth/presentation/components/auth-ui';
import { TerritoryScreen } from '@/features/territory/presentation/territory-screen';
import { PersonnelManagementScreen } from '@/features/personnel/presentation/personnel-management-screen';
import { EvidenceCaptureScreen } from '@/features/evidence/presentation/evidence-capture-screen';
import { ActRegistrationScreen } from '@/features/acts/presentation/act-registration-screen';
import { ActOcrReviewScreen } from '@/features/acts/presentation/act-ocr-review-screen';
import { ActCorrectionScreen } from '@/features/acts/presentation/act-correction-screen';
import { DashboardScreen } from '@/features/dashboard/presentation/dashboard-screen';
import { OfflineHistoryScreen } from '@/features/offline/presentation/offline-history-screen';
import {
  loadOfflineOperations,
  setOnline,
  syncOfflineOperations,
} from '@/features/offline/presentation/offline-slice';
import { appDependencies, useAppDispatch, useAppSelector } from '@/store/store';
import type {
  AuthStackParamList,
  RootStackParamList,
  WorkspaceStackParamList,
} from '@/navigation/types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const WorkspaceStack = createNativeStackNavigator<WorkspaceStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'controlelectoral://'],
  config: {
    screens: {
      Auth: {
        path: '',
        screens: {
          Login: 'login',
          ForgotPassword: 'forgot-password',
          ResetPassword: 'reset-password',
        },
      },
      Workspace: {
        path: 'workspace',
        screens: {
          ProvincialHome: 'provincial',
          TerritorialStructure: 'territory',
          PersonnelManagement: 'personnel',
          Dashboard: 'dashboard',
          OfflineHistory: 'pending',
          ActRegistration: 'act-registration',
          ActOcrReview: 'act-ocr/:actId/:evidenceId',
          ActCorrection: 'act-correction/:actId',
          PrecinctCoordinatorHome: 'precinct-coordinator',
          ObserverHome: 'observer',
        },
      },
    },
  },
};

function AuthNavigator() {
  const passwordRecovery = useAppSelector((state) => state.auth.passwordRecovery);

  return (
    <AuthStack.Navigator
      key={passwordRecovery ? 'recovery' : 'regular'}
      initialRouteName={passwordRecovery ? 'ResetPassword' : 'Login'}
      screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function ProvincialHomeScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, 'ProvincialHome'>) {
  return (
    <RoleHome
      role={userRoles.provincialCoordinator}
      onOpenTerritory={() => navigation.navigate('TerritorialStructure')}
      onOpenPersonnel={() => navigation.navigate('PersonnelManagement')}
      onOpenDashboard={() => navigation.navigate('Dashboard')}
      onOpenOfflineHistory={() => navigation.navigate('OfflineHistory')}
    />
  );
}

function PrecinctCoordinatorHomeScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, 'PrecinctCoordinatorHome'>) {
  return (
    <RoleHome
      role={userRoles.precinctCoordinator}
      onOpenPersonnel={() => navigation.navigate('PersonnelManagement')}
      onOpenDashboard={() => navigation.navigate('Dashboard')}
      onOpenOfflineHistory={() => navigation.navigate('OfflineHistory')}
    />
  );
}

function ObserverHomeScreen({
  navigation,
}: NativeStackScreenProps<WorkspaceStackParamList, 'ObserverHome'>) {
  return (
    <RoleHome
      role={userRoles.observer}
      onOpenActRegistration={() => navigation.navigate('ActRegistration')}
      onOpenOfflineHistory={() => navigation.navigate('OfflineHistory')}
    />
  );
}

function useOfflineBootstrap(authenticated: boolean) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let active = true;
    const refresh = async () => {
      const online = await appDependencies.networkStatus.isOnline();
      if (!active) {
        return;
      }
      dispatch(setOnline(online));
      void dispatch(loadOfflineOperations());
      if (online) {
        void dispatch(syncOfflineOperations());
        void appDependencies.errorReporter.flush?.();
      }
    };
    void refresh();

    const unsubscribe = appDependencies.networkStatus.subscribe((online) => {
      dispatch(setOnline(online));
      if (online) {
        void dispatch(syncOfflineOperations());
        void appDependencies.errorReporter.flush?.();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authenticated, dispatch]);
}

function WorkspaceNavigator() {
  const role = useAppSelector((state) => state.auth.profile?.role);

  if (!role) {
    return <LoadingScreen />;
  }

  return (
    <WorkspaceStack.Navigator
      key={role}
      initialRouteName={
        role === userRoles.provincialCoordinator
          ? 'ProvincialHome'
          : role === userRoles.precinctCoordinator
            ? 'PrecinctCoordinatorHome'
            : 'ObserverHome'
      }
      screenOptions={{ headerShown: false, animation: 'fade' }}>
      <WorkspaceStack.Screen name="OfflineHistory" component={OfflineHistoryScreen} />
      {role === userRoles.provincialCoordinator ? (
        <>
          <WorkspaceStack.Screen
            name="ProvincialHome"
            component={ProvincialHomeScreen}
          />
          <WorkspaceStack.Screen
            name="TerritorialStructure"
            component={TerritoryScreen}
          />
          <WorkspaceStack.Screen
            name="PersonnelManagement"
            component={PersonnelManagementScreen}
          />
          <WorkspaceStack.Screen name="Dashboard" component={DashboardScreen} />
        </>
      ) : null}
      {role === userRoles.precinctCoordinator ? (
        <>
          <WorkspaceStack.Screen
            name="PrecinctCoordinatorHome"
            component={PrecinctCoordinatorHomeScreen}
          />
          <WorkspaceStack.Screen
            name="PersonnelManagement"
            component={PersonnelManagementScreen}
          />
          <WorkspaceStack.Screen
            name="ActCorrection"
            component={ActCorrectionScreen}
          />
          <WorkspaceStack.Screen name="Dashboard" component={DashboardScreen} />
        </>
      ) : null}
      {role === userRoles.observer ? (
        <>
          <WorkspaceStack.Screen name="ObserverHome" component={ObserverHomeScreen} />
          <WorkspaceStack.Screen
            name="EvidenceCapture"
            component={EvidenceCaptureScreen}
          />
          <WorkspaceStack.Screen
            name="ActRegistration"
            component={ActRegistrationScreen}
          />
          <WorkspaceStack.Screen
            name="ActOcrReview"
            component={ActOcrReviewScreen}
          />
          <WorkspaceStack.Screen
            name="ActCorrection"
            component={ActCorrectionScreen}
          />
        </>
      ) : null}
    </WorkspaceStack.Navigator>
  );
}

export function AppNavigator() {
  const { passwordRecovery, profile, status } = useAppSelector((state) => state.auth);
  const showWorkspace =
    status === 'authenticated' && profile !== null && !passwordRecovery;
  useOfflineBootstrap(showWorkspace);

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer linking={linking} fallback={<LoadingScreen />}>
      <RootStack.Navigator
        key={showWorkspace ? `workspace-${profile.role}` : `auth-${passwordRecovery}`}
        screenOptions={{ headerShown: false }}>
        {showWorkspace ? (
          <RootStack.Screen name="Workspace" component={WorkspaceNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

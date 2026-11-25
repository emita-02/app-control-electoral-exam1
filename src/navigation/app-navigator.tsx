import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import ForgotPasswordScreen from '@/features/auth/presentation/screens/forgot-password-screen';
import LoginScreen from '@/features/auth/presentation/screens/login-screen';
import ResetPasswordScreen from '@/features/auth/presentation/screens/reset-password-screen';
import { RoleHome } from '@/features/auth/presentation/role-home';
import { userRoles } from '@/features/auth/domain/user-profile';
import { LoadingScreen } from '@/features/auth/presentation/components/auth-ui';
import { TerritoryScreen } from '@/features/territory/presentation/territory-screen';
import { PersonnelManagementScreen } from '@/features/personnel/presentation/personnel-management-screen';
import { useAppSelector } from '@/store/store';
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
    />
  );
}

function ObserverHomeScreen() {
  return <RoleHome role={userRoles.observer} />;
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
        </>
      ) : null}
      {role === userRoles.observer ? (
        <WorkspaceStack.Screen name="ObserverHome" component={ObserverHomeScreen} />
      ) : null}
    </WorkspaceStack.Navigator>
  );
}

export function AppNavigator() {
  const { passwordRecovery, profile, status } = useAppSelector((state) => state.auth);
  const showWorkspace =
    status === 'authenticated' && profile !== null && !passwordRecovery;

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

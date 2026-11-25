import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type WorkspaceStackParamList = {
  ProvincialHome: undefined;
  TerritorialStructure: undefined;
  PrecinctCoordinatorHome: undefined;
  ObserverHome: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Workspace: NavigatorScreenParams<WorkspaceStackParamList> | undefined;
};

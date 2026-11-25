import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type WorkspaceStackParamList = {
  ProvincialHome: undefined;
  TerritorialStructure: undefined;
  PersonnelManagement: undefined;
  Dashboard: undefined;
  OfflineHistory: undefined;
  EvidenceCapture: { actId: number };
  ActRegistration: undefined;
  ActOcrReview: { actId: number; evidenceId: number; reviewKey?: string };
  ActCorrection: { actId: number };
  PrecinctCoordinatorHome: undefined;
  ObserverHome: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Workspace: NavigatorScreenParams<WorkspaceStackParamList> | undefined;
};

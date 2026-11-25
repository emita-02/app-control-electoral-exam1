export const userRoles = {
  provincialCoordinator: 'coordinador_provincial',
  precinctCoordinator: 'coordinador_recinto',
  observer: 'veedor',
} as const;

export type UserRole = (typeof userRoles)[keyof typeof userRoles];

export type UserProfile = {
  id: string;
  fullName: string;
  roleId: number;
  role: UserRole;
  provinceId: number | null;
  pollingPlaceId: number | null;
};

export const roleLabels: Record<UserRole, string> = {
  coordinador_provincial: 'Coordinador provincial',
  coordinador_recinto: 'Coordinador de recinto',
  veedor: 'Veedor electoral',
};

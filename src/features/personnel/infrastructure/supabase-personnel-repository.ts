import { userRoles } from '@/features/auth/domain/user-profile';
import type {
  CreatePersonnelInput,
  PersonnelMember,
  PersonnelOverview,
  PersonnelRepository,
  SaveWatcherAssignmentsInput,
  WatcherAssignment,
} from '@/features/personnel/domain/personnel';
import type {
  Canton,
  ElectoralTable,
  PollingPlace,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';
import { supabase } from '@/features/auth/infrastructure/supabase-client';

const roleIds = {
  coordinador_recinto: 2,
  veedor: 3,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResponseLike(value: unknown): value is Pick<Response, 'clone' | 'status'> {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.clone === 'function'
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readNullableInteger(value: unknown): number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }
  return value;
}

function mapMember(value: unknown): PersonnelMember {
  const record = readRecord(value);
  const roleId = readInteger(record.role_id);
  const role =
    roleId === roleIds.coordinador_recinto
      ? userRoles.precinctCoordinator
      : roleId === roleIds.veedor
        ? userRoles.observer
        : null;

  if (!role || typeof record.is_active !== 'boolean') {
    throw new Error('El servidor devolvió datos de personal con formato no válido.');
  }

  return {
    id: readString(record.id),
    fullName: readString(record.full_name),
    role,
    provinceId: readNullableInteger(record.province_id),
    pollingPlaceId: readNullableInteger(record.polling_place_id),
    isActive: record.is_active,
  };
}

function mapElectoralTable(value: unknown): ElectoralTable {
  const record = readRecord(value);
  return {
    id: readInteger(record.id),
    tableNumber: readInteger(record.table_number),
  };
}

function mapAssignment(value: unknown): WatcherAssignment {
  const record = readRecord(value);
  const relation = Array.isArray(record.electoral_tables)
    ? record.electoral_tables[0]
    : record.electoral_tables;
  const table = readRecord(relation);

  return {
    id: readInteger(record.id),
    watcherId: readString(record.watcher_id),
    electoralTableId: readInteger(record.electoral_table_id),
    tableNumber: readInteger(table.table_number),
    assignedAt: readString(record.assigned_at),
    endedAt: readNullableString(record.ended_at),
    endedBy: readNullableString(record.ended_by),
    endReason: readNullableString(record.end_reason),
  };
}

function flattenPollingPlaces(cantons: Canton[]): PollingPlace[] {
  return cantons.flatMap((canton) =>
    canton.parishes.flatMap((parish) => parish.pollingPlaces),
  );
}

export class SupabasePersonnelRepository implements PersonnelRepository {
  constructor(private readonly territoryRepository: ProvinceTerritoryRepository) {}

  async load(profile: Parameters<PersonnelRepository['load']>[0]): Promise<PersonnelOverview> {
    const emptyOverview: PersonnelOverview = {
      members: [],
      assignments: [],
      electoralTables: [],
      pollingPlaces: [],
    };

    if (profile.role === userRoles.provincialCoordinator) {
      if (profile.provinceId === null) {
        throw new Error('Tu perfil no tiene una provincia asignada.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role_id, province_id, polling_place_id, is_active')
        .eq('role_id', roleIds.coordinador_recinto)
        .eq('province_id', profile.provinceId)
        .order('full_name');

      if (error) {
        throw new Error('No se pudieron consultar los coordinadores de recinto.');
      }

      const province = await this.territoryRepository.findByProvinceId(profile.provinceId);
      return {
        ...emptyOverview,
        members: (data ?? []).map(mapMember),
        pollingPlaces: flattenPollingPlaces(province.cantons),
      };
    }

    if (profile.role !== userRoles.precinctCoordinator || profile.pollingPlaceId === null) {
      throw new Error('Tu cuenta no tiene acceso a la gestión de personal.');
    }

    const [membersResult, tablesResult, assignmentsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role_id, province_id, polling_place_id, is_active')
        .eq('role_id', roleIds.veedor)
        .eq('polling_place_id', profile.pollingPlaceId)
        .order('full_name'),
      supabase
        .from('electoral_tables')
        .select('id, table_number')
        .eq('polling_place_id', profile.pollingPlaceId)
        .order('table_number'),
      supabase
        .from('watcher_assignments')
        .select(
          'id, watcher_id, electoral_table_id, assigned_at, ended_at, ended_by, end_reason, electoral_tables!inner(id, table_number, polling_place_id)',
        )
        .eq('electoral_tables.polling_place_id', profile.pollingPlaceId)
        .order('assigned_at', { ascending: false }),
    ]);

    if (membersResult.error || tablesResult.error || assignmentsResult.error) {
      throw new Error('No se pudo consultar el personal y las asignaciones del recinto.');
    }

    return {
      ...emptyOverview,
      members: (membersResult.data ?? []).map(mapMember),
      electoralTables: (tablesResult.data ?? []).map(mapElectoralTable),
      assignments: (assignmentsResult.data ?? []).map(mapAssignment),
    };
  }

  async createMember(input: CreatePersonnelInput): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { error } = await supabase.functions.invoke<unknown>('gestionar-personal', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action: 'create_member',
        role: input.role,
        fullName: input.fullName,
        email: input.email,
        pollingPlaceId: input.pollingPlaceId ?? null,
      },
    });

    if (error) {
      throw new Error(await this.getCreateMemberErrorMessage(error));
    }
  }

  async saveAssignments(input: SaveWatcherAssignmentsInput): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }

    const { error } = await supabase.functions.invoke<unknown>('gestionar-personal', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action: 'save_assignments',
        watcherId: input.watcherId,
        electoralTableIds: input.electoralTableIds,
        replacingWatcherId: input.replacingWatcherId ?? null,
        endReason: input.endReason ?? null,
      },
    });

    if (error) {
      throw new Error(await this.getFunctionErrorMessage(error));
    }
  }

  private async getFunctionErrorMessage(error: { context: unknown }): Promise<string> {
    if (error.context instanceof Response) {
      try {
        const body: unknown = await error.context.clone().json();
        if (isRecord(body) && typeof body.error === 'string') {
          return body.error;
        }
      } catch {
        return 'No se pudo completar la operación. Verifica tu conexión e inténtalo nuevamente.';
      }
    }

    return 'No se pudo completar la operación. Verifica tu conexión y tus permisos.';
  }

  private async getCreateMemberErrorMessage(error: { context: unknown }): Promise<string> {
    if (!isResponseLike(error.context)) {
      return 'No se pudo contactar el servicio de creación de personal. Verifica tu conexión.';
    }

    try {
      const body: unknown = await error.context.clone().json();
      if (isRecord(body)) {
        if (typeof body.error === 'string') {
          return body.error;
        }
        if (body.code === 'EDGE_FUNCTION_ERROR') {
          return `El servidor de personal respondió con un error interno (HTTP ${error.context.status}; ${body.code}).`;
        }
        if (typeof body.message === 'string') {
          return body.message;
        }
      }
    } catch {
      return `El servidor de personal respondió con HTTP ${error.context.status}.`;
    }

    return `El servidor de personal respondió con HTTP ${error.context.status} sin un detalle de error.`;
  }
}

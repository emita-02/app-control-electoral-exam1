import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const emailPattern =
  /^(?=.{1,254}$)[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

type CreateMemberBody = {
  action: "create_member";
  role: "coordinador_recinto" | "veedor";
  roleId: number;
  fullName: string;
  idCard: string;
  phone: string;
  email: string;
  pollingPlaceId: number | null;
  /** Mesas elegidas al crear un veedor; vacío al crear un coordinador de recinto. */
  electoralTableIds: number[];
};

type SaveAssignmentsBody = {
  action: "save_assignments";
  watcherRoleId: number;
  watcherId: string;
  electoralTableIds: number[];
  replacingWatcherId: string | null;
  endReason: string | null;
};

type RequestBody = CreateMemberBody | SaveAssignmentsBody;
type ProfileScope = {
  id: string;
  province_id: number | null;
  polling_place_id: number | null;
  is_active: boolean;
};
type ProvinceLookup = {
  provinceId: number | null;
  failed: boolean;
  detail?: string;
};
type AssignmentRow = {
  id: number;
  watcher_id: string;
  electoral_table_id: number;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProfileScope(value: unknown): ProfileScope | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    (value.province_id !== null &&
      (typeof value.province_id !== "number" ||
        !Number.isSafeInteger(value.province_id))) ||
    (value.polling_place_id !== null &&
      (typeof value.polling_place_id !== "number" ||
        !Number.isSafeInteger(value.polling_place_id))) ||
    typeof value.is_active !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    province_id: value.province_id,
    polling_place_id: value.polling_place_id,
    is_active: value.is_active,
  };
}

type ParseFailure = { error: string; detail?: string };
type ParseResult = { body: RequestBody } | ParseFailure;

function isParseFailure(result: ParseResult): result is ParseFailure {
  return "error" in result;
}

function parseRequestBody(value: unknown): ParseResult {
  if (!isRecord(value) || typeof value.action !== "string") {
    return { error: "Revisa los datos enviados." };
  }

  if (value.action === "create_member") {
    const allowedFields = new Set([
      "action",
      "role",
      "roleId",
      "fullName",
      "idCard",
      "phone",
      "email",
      "pollingPlaceId",
      "electoralTableIds",
    ]);
    const unexpectedFields = Object.keys(value).filter(
      (key) => !allowedFields.has(key),
    );
    const tableIdsValue = value.electoralTableIds;
    const tableIds = Array.isArray(tableIdsValue) ? tableIdsValue : [];
    if (
      unexpectedFields.length > 0 ||
      (value.role !== "coordinador_recinto" && value.role !== "veedor") ||
      (typeof value.roleId !== "number" ||
        !Number.isSafeInteger(value.roleId) ||
        value.roleId <= 0) ||
      typeof value.fullName !== "string" ||
      !value.fullName.trim() ||
      value.fullName.trim().length > 160 ||
      typeof value.idCard !== "string" ||
      !value.idCard.trim() ||
      value.idCard.trim().length > 32 ||
      typeof value.phone !== "string" ||
      !value.phone.trim() ||
      value.phone.trim().length > 32 ||
      typeof value.email !== "string" ||
      !emailPattern.test(value.email.trim()) ||
      value.email.trim().length > 254 ||
      (value.pollingPlaceId !== null &&
        (typeof value.pollingPlaceId !== "number" ||
          !Number.isSafeInteger(value.pollingPlaceId) ||
          value.pollingPlaceId <= 0)) ||
      !Array.isArray(tableIdsValue) ||
      tableIds.some(
        (id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
      ) ||
      new Set(tableIds).size !== tableIds.length ||
      (value.role === "veedor" && tableIds.length === 0) ||
      (value.role === "coordinador_recinto" && tableIds.length > 0)
    ) {
      const detail: string[] = [];
      if (unexpectedFields.length > 0) {
        detail.push(`campos no esperados: ${unexpectedFields.join(", ")}`);
      }
      if (value.role !== "coordinador_recinto" && value.role !== "veedor") {
        detail.push("role debe ser coordinador_recinto o veedor");
      }
      if (
        typeof value.roleId !== "number" ||
        !Number.isSafeInteger(value.roleId) ||
        value.roleId <= 0
      ) {
        detail.push("roleId debe ser un entero positivo");
      }
      if (
        typeof value.fullName !== "string" ||
        !value.fullName.trim() ||
        value.fullName.trim().length > 160
      ) {
        detail.push("fullName es obligatorio y no supera los 160 caracteres");
      }
      if (
        typeof value.idCard !== "string" ||
        !value.idCard.trim() ||
        value.idCard.trim().length > 32
      ) {
        detail.push("idCard es obligatorio y no supera los 32 caracteres");
      }
      if (
        typeof value.phone !== "string" ||
        !value.phone.trim() ||
        value.phone.trim().length > 32
      ) {
        detail.push("phone es obligatorio y no supera los 32 caracteres");
      }
      if (
        typeof value.email !== "string" ||
        !emailPattern.test(value.email.trim()) ||
        value.email.trim().length > 254
      ) {
        detail.push("email no es válido o supera los 254 caracteres");
      }
      if (
        value.pollingPlaceId !== null &&
        (typeof value.pollingPlaceId !== "number" ||
          !Number.isSafeInteger(value.pollingPlaceId) ||
          value.pollingPlaceId <= 0)
      ) {
        detail.push("pollingPlaceId debe ser null o un entero positivo");
      }
      if (
        !Array.isArray(tableIdsValue) ||
        tableIds.some(
          (id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
        ) ||
        new Set(tableIds).size !== tableIds.length ||
        (value.role === "veedor" && tableIds.length === 0) ||
        (value.role === "coordinador_recinto" && tableIds.length > 0)
      ) {
        detail.push(
          "electoralTableIds debe ser una lista de ids positivos sin repetir; obligatoria para veedor y vacía para coordinador de recinto",
        );
      }
      return {
        error: "Revisa los datos enviados.",
        detail: detail.join("; "),
      };
    }

    return {
      body: {
        action: "create_member",
        role: value.role,
        roleId: value.roleId,
        fullName: value.fullName.trim(),
        idCard: value.idCard.trim(),
        phone: value.phone.trim(),
        email: value.email.trim().toLowerCase(),
        pollingPlaceId: value.pollingPlaceId,
        electoralTableIds: tableIds,
      },
    };
  }

  if (value.action === "save_assignments") {
    const allowedFields = new Set([
      "action",
      "watcherRoleId",
      "watcherId",
      "electoralTableIds",
      "replacingWatcherId",
      "endReason",
    ]);
    const unexpectedFields = Object.keys(value).filter(
      (key) => !allowedFields.has(key),
    );
    if (
      unexpectedFields.length > 0 ||
      (typeof value.watcherRoleId !== "number" ||
        !Number.isSafeInteger(value.watcherRoleId) ||
        value.watcherRoleId <= 0) ||
      typeof value.watcherId !== "string" ||
      !value.watcherId.trim() ||
      !Array.isArray(value.electoralTableIds) ||
      value.electoralTableIds.length === 0 ||
      value.electoralTableIds.some(
        (id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
      ) ||
      (value.replacingWatcherId !== null &&
        (typeof value.replacingWatcherId !== "string" ||
          !value.replacingWatcherId.trim())) ||
      (value.endReason !== null &&
        (typeof value.endReason !== "string" || value.endReason.trim().length > 500))
    ) {
      return {
        error: "Revisa los datos enviados.",
        detail:
          unexpectedFields.length > 0
            ? `campos no esperados: ${unexpectedFields.join(", ")}`
            : "watcherRoleId, watcherId, electoralTableIds, replacingWatcherId o endReason no son válidos",
      };
    }

    const tableIds = [...new Set(value.electoralTableIds)];
    if (tableIds.length !== value.electoralTableIds.length) {
      return {
        error: "Revisa los datos enviados.",
        detail: "electoralTableIds contiene mesas repetidas",
      };
    }

    return {
      body: {
        action: "save_assignments",
        watcherRoleId: value.watcherRoleId,
        watcherId: value.watcherId.trim(),
        electoralTableIds: tableIds,
        replacingWatcherId: value.replacingWatcherId,
        endReason: value.endReason?.trim() || null,
      },
    };
  }

  return {
    error: "Revisa los datos enviados.",
    detail: "action no reconocido",
  };
}

// Estos son los mismos identificadores que la app ya usa para interpretar
// `profiles.role_id`. Se validan en servidor para no aceptar un roleId arbitrario.
const ALLOWED_ROLE_IDS: Record<"coordinador_recinto" | "veedor", number> = {
  coordinador_recinto: 2,
  veedor: 3,
};

  async function getRoleId(
    _serviceSupabase: ReturnType<typeof createClient>,
    roleCode: "coordinador_recinto" | "veedor",
    providedRoleId?: number,
  ): Promise<number | null> {
    const expectedId = ALLOWED_ROLE_IDS[roleCode];
    if (providedRoleId !== undefined && providedRoleId !== expectedId) {
      console.error("gestionar-personal: roleId no coincide con el rol solicitado", {
        roleCode,
        providedRoleId,
        expectedId,
      });
      return null;
    }
    return expectedId;
  }

async function getPollingPlaceProvince(
  serviceSupabase: ReturnType<typeof createClient>,
  pollingPlaceId: number,
): Promise<ProvinceLookup> {
  const { data: pollingPlace, error: pollingPlaceError } = await serviceSupabase
    .from("polling_places")
    .select("parish_id")
    .eq("id", pollingPlaceId)
    .maybeSingle();
  if (pollingPlaceError) {
    console.error("gestionar-personal: falló polling_places.parish_id", pollingPlaceError);
    return {
      provinceId: null,
      failed: true,
      detail: pollingPlaceError.message ?? "error al consultar polling_places",
    };
  }
  if (!pollingPlace) {
    return { provinceId: null, failed: false };
  }

  const { data: parish, error: parishError } = await serviceSupabase
    .from("parishes")
    .select("canton_id")
    .eq("id", pollingPlace.parish_id)
    .maybeSingle();
  if (parishError) {
    console.error("gestionar-personal: falló parishes.canton_id", parishError);
    return {
      provinceId: null,
      failed: true,
      detail: parishError.message ?? "error al consultar parishes",
    };
  }
  if (!parish) {
    return { provinceId: null, failed: false };
  }

  const { data: canton, error: cantonError } = await serviceSupabase
    .from("cantons")
    .select("province_id")
    .eq("id", parish.canton_id)
    .maybeSingle();
  if (cantonError) {
    console.error("gestionar-personal: falló cantons.province_id", cantonError);
    return {
      provinceId: null,
      failed: true,
      detail: cantonError.message ?? "error al consultar cantons",
    };
  }
  if (!canton || typeof canton.province_id !== "number") {
    return { provinceId: null, failed: false };
  }

  return { provinceId: canton.province_id, failed: false };
}

// Un veedor recién creado solo puede recibir mesas reales de su recinto y sin
// asignación activa. Se comprueba antes de invitar y de nuevo justo antes de
// escribir, para reducir la ventana entre Auth y PostgreSQL.
async function validateTablesForNewWatcher(
  serviceSupabase: ReturnType<typeof createClient>,
  pollingPlaceId: number,
  tableIds: number[],
): Promise<{ error: string; status: number } | null> {
  const { data: tables, error: tablesError } = await serviceSupabase
    .from("electoral_tables")
    .select("id")
    .eq("polling_place_id", pollingPlaceId)
    .in("id", tableIds);
  if (tablesError) {
    console.error("gestionar-personal: falló validación de mesas del veedor", tablesError);
    return { error: "No se pudieron validar las mesas seleccionadas.", status: 500 };
  }
  if ((tables ?? []).length !== tableIds.length) {
    return { error: "Una o más mesas no pertenecen a tu recinto.", status: 403 };
  }

  const { data: activeAssignments, error: assignmentsError } = await serviceSupabase
    .from("watcher_assignments")
    .select("id")
    .is("ended_at", null)
    .in("electoral_table_id", tableIds);
  if (assignmentsError) {
    console.error(
      "gestionar-personal: falló consulta de asignaciones activas",
      assignmentsError,
    );
    return { error: "No se pudieron comprobar las asignaciones actuales.", status: 500 };
  }
  if ((activeAssignments ?? []).length > 0) {
    return {
      error: "Una o más mesas ya están asignadas a otro veedor.",
      status: 409,
    };
  }
  return null;
}

async function createMember(
  body: CreateMemberBody,
  userId: string,
  role: string,
  callerProfile: ProfileScope,
  serviceSupabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const isProvincial = role === "coordinador_provincial";
  const isPrecinct = role === "coordinador_recinto";
  if (
    (body.role === "coordinador_recinto" && !isProvincial) ||
    (body.role === "veedor" && !isPrecinct)
  ) {
    return jsonResponse({ error: "No tienes permiso para crear este tipo de cuenta." }, 403);
  }

  let provinceId: number;
  let pollingPlaceId: number;

  if (body.role === "coordinador_recinto") {
    if (
      callerProfile.province_id === null ||
      body.pollingPlaceId === null
    ) {
      return jsonResponse({ error: "Tu cuenta o el recinto no tiene una jurisdicción válida." }, 400);
    }
    const placeProvince = await getPollingPlaceProvince(
      serviceSupabase,
      body.pollingPlaceId,
    );
    if (placeProvince.failed) {
      return jsonResponse(
        {
          error: "No se pudo validar la jurisdicción del recinto.",
          detail: placeProvince.detail ?? "error de consulta territorial",
        },
        500,
      );
    }
    if (placeProvince.provinceId === null) {
      return jsonResponse({ error: "No se encontró el recinto seleccionado." }, 404);
    }
    if (placeProvince.provinceId !== callerProfile.province_id) {
      return jsonResponse({ error: "El recinto no pertenece a tu provincia." }, 403);
    }
    provinceId = callerProfile.province_id;
    pollingPlaceId = body.pollingPlaceId;
  } else {
    if (
      callerProfile.province_id === null ||
      callerProfile.polling_place_id === null ||
      body.pollingPlaceId !== null
    ) {
      return jsonResponse({ error: "Tu cuenta no tiene un recinto activo asignado." }, 403);
    }
    provinceId = callerProfile.province_id;
    pollingPlaceId = callerProfile.polling_place_id;
  }

  const roleId = await getRoleId(serviceSupabase, body.role, body.roleId);
  if (roleId === null) {
    return jsonResponse({ error: "No se pudo validar el rol solicitado." }, 500);
  }

  if (body.role === "veedor") {
    const tableProblem = await validateTablesForNewWatcher(
      serviceSupabase,
      pollingPlaceId,
      body.electoralTableIds,
    );
    if (tableProblem) {
      return jsonResponse({ error: tableProblem.error }, tableProblem.status);
    }
  }

  if (body.role === "coordinador_recinto") {
    const { data: existingCoordinator, error: coordinatorError } =
      await serviceSupabase
        .from("profiles")
        .select("id")
        .eq("role_id", roleId)
        .eq("polling_place_id", pollingPlaceId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    if (coordinatorError) {
      return jsonResponse({ error: "No se pudo comprobar el coordinador del recinto." }, 500);
    }
    if (existingCoordinator) {
      return jsonResponse(
        { error: "Este recinto ya tiene un coordinador activo." },
        409,
      );
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "La función no tiene configuradas las credenciales del servidor." },
      500,
    );
  }

  const { data: invitedUser, error: inviteError } =
    await serviceSupabase.auth.admin.inviteUserByEmail(body.email, {
      data: { full_name: body.fullName },
      redirectTo: "controlelectoral://reset-password",
    });

  if (inviteError || !invitedUser.user) {
    if (inviteError) {
      console.error("gestionar-personal: falló inviteUserByEmail", {
        message: inviteError.message,
        code: inviteError.code,
        status: inviteError.status,
      });
    }
    return jsonResponse(
      {
        error:
          inviteError?.code === "email_exists"
            ? "Ya existe una cuenta con ese correo electrónico."
            : "No se pudo enviar la invitación. Verifica la configuración de correo y enlaces de Supabase.",
      },
      inviteError?.code === "email_exists" ? 409 : 502,
    );
  }

  if (body.role === "veedor") {
    const tableProblem = await validateTablesForNewWatcher(
      serviceSupabase,
      pollingPlaceId,
      body.electoralTableIds,
    );
    if (tableProblem) {
      const { error: cleanupError } = await serviceSupabase.auth.admin.deleteUser(
        invitedUser.user.id,
      );
      if (cleanupError) {
        return jsonResponse(
          {
            error:
              "Las mesas ya no están disponibles y no se pudo limpiar la cuenta invitada. Contacta al administrador.",
          },
          500,
        );
      }
      return jsonResponse({ error: tableProblem.error }, tableProblem.status);
    }
  }

  const { error: profileError } = await serviceSupabase.from("profiles").insert({
    id: invitedUser.user.id,
    full_name: body.fullName,
    id_card: body.idCard,
    phone: body.phone,
    role_id: roleId,
    province_id: provinceId,
    polling_place_id: pollingPlaceId,
    created_by: userId,
    is_active: true,
  });

  if (profileError) {
    console.error("gestionar-personal: falló insert en profiles", {
      message: profileError.message,
      code: profileError.code,
      details: profileError.details,
      hint: profileError.hint,
    });
    const { error: cleanupError } = await serviceSupabase.auth.admin.deleteUser(
      invitedUser.user.id,
    );
    if (cleanupError) {
      return jsonResponse(
        {
          error:
            "La invitación se envió, pero no se pudo crear el perfil ni limpiar la cuenta incompleta. Contacta al administrador.",
        },
        500,
      );
    }
    return jsonResponse(
      { error: "No se pudo crear el perfil de la cuenta invitada." },
      500,
    );
  }

  if (body.electoralTableIds.length > 0) {
    const assignments = body.electoralTableIds.map((tableId) => ({
      watcher_id: invitedUser.user.id,
      electoral_table_id: tableId,
      assigned_by: userId,
    }));
    const { error: assignmentError } = await serviceSupabase
      .from("watcher_assignments")
      // No hay tipos generados de la base de datos: sin este cast el cliente
      // infiere `never[]` y aparece un error nuevo además de los preexistentes.
      .insert(assignments as unknown as never[]);

    if (assignmentError) {
      console.error("gestionar-personal: falló insert en watcher_assignments", {
        message: assignmentError.message,
        code: assignmentError.code,
        details: assignmentError.details,
        hint: assignmentError.hint,
      });
      // El perfil y las asignaciones no comparten transacción con Auth: si
      // falla el último inserto, se intentan ambos borrados compensatorios
      // (incluso si el primero falla) para no dejar cuenta ni perfil huérfanos.
      const { error: profileCleanupError } = await serviceSupabase
        .from("profiles")
        .delete()
        .eq("id", invitedUser.user.id);
      const { error: authCleanupError } =
        await serviceSupabase.auth.admin.deleteUser(invitedUser.user.id);
      if (profileCleanupError || authCleanupError) {
        console.error("gestionar-personal: falló limpieza tras asignaciones", {
          profileCleanupError,
          authCleanupError,
        });
        return jsonResponse(
          {
            error:
              "No se pudieron guardar las asignaciones ni limpiar la cuenta incompleta. Contacta al administrador antes de reintentar.",
          },
          500,
        );
      }
      return jsonResponse(
        { error: "No se pudieron guardar las asignaciones del veedor." },
        500,
      );
    }
  }

  return jsonResponse(
    { invited: true, assignedCount: body.electoralTableIds.length },
    201,
  );
}

async function saveAssignments(
  body: SaveAssignmentsBody,
  userId: string,
  callerProfile: ProfileScope,
  role: string,
  serviceSupabase: ReturnType<typeof createClient>,
): Promise<Response> {
  if (
    role !== "coordinador_recinto" ||
    callerProfile.polling_place_id === null ||
    callerProfile.province_id === null
  ) {
    return jsonResponse(
      { error: "Solo el coordinador de recinto puede gestionar estas asignaciones." },
      403,
    );
  }
  if (
    body.replacingWatcherId &&
    (body.replacingWatcherId === body.watcherId || !body.endReason)
  ) {
    return jsonResponse(
      { error: "Selecciona un veedor distinto e indica el motivo del reemplazo." },
      400,
    );
  }

  const watcherRoleId = await getRoleId(
    serviceSupabase,
    "veedor",
    body.watcherRoleId,
  );
  if (watcherRoleId === null) {
    return jsonResponse({ error: "No se pudo validar el rol de veedor." }, 500);
  }

  const { data: watcher, error: watcherError } = await serviceSupabase
    .from("profiles")
    .select("id, province_id, polling_place_id, is_active")
    .eq("id", body.watcherId)
    .eq("role_id", watcherRoleId)
    .maybeSingle();
  if (watcherError || !watcher) {
    return jsonResponse({ error: "No se encontró el veedor seleccionado." }, 404);
  }
  if (
    watcher.is_active !== true ||
    watcher.province_id !== callerProfile.province_id ||
    watcher.polling_place_id !== callerProfile.polling_place_id
  ) {
    return jsonResponse(
      { error: "El veedor no pertenece a tu recinto o su cuenta está inactiva." },
      403,
    );
  }

  if (body.replacingWatcherId) {
    const { data: previousWatcher, error: previousWatcherError } =
      await serviceSupabase
        .from("profiles")
        .select("id, province_id, polling_place_id, is_active")
        .eq("id", body.replacingWatcherId)
        .eq("role_id", watcherRoleId)
        .maybeSingle();
    if (previousWatcherError || !previousWatcher) {
      return jsonResponse({ error: "No se encontró el veedor que se reemplaza." }, 404);
    }
    if (
      previousWatcher.province_id !== callerProfile.province_id ||
      previousWatcher.polling_place_id !== callerProfile.polling_place_id
    ) {
      return jsonResponse(
        { error: "El veedor que se reemplaza no pertenece a tu recinto." },
        403,
      );
    }
  }

  const { data: tables, error: tablesError } = await serviceSupabase
    .from("electoral_tables")
    .select("id")
    .eq("polling_place_id", callerProfile.polling_place_id)
    .in("id", body.electoralTableIds);
  if (tablesError) {
    return jsonResponse({ error: "No se pudieron validar las mesas seleccionadas." }, 500);
  }
  if ((tables ?? []).length !== body.electoralTableIds.length) {
    return jsonResponse(
      { error: "Una o más mesas no pertenecen a tu recinto." },
      403,
    );
  }

  let previousAssignments: AssignmentRow[] = [];
  if (body.replacingWatcherId) {
    const { data, error } = await serviceSupabase
      .from("watcher_assignments")
      .select("id, electoral_table_id")
      .eq("watcher_id", body.replacingWatcherId)
      .is("ended_at", null)
      .in("electoral_table_id", body.electoralTableIds);
    if (error) {
      return jsonResponse({ error: "No se pudieron consultar las asignaciones vigentes." }, 500);
    }
    previousAssignments = data ?? [];
    const assignedTableIds = new Set(
      previousAssignments.map((assignment) => assignment.electoral_table_id),
    );
    if (body.electoralTableIds.some((id) => !assignedTableIds.has(id))) {
      return jsonResponse(
        { error: "El veedor saliente no tiene asignadas todas las mesas seleccionadas." },
        409,
      );
    }
  }

  const { data: activeAssignments, error: targetAssignmentsError } =
    await serviceSupabase
      .from("watcher_assignments")
      .select("watcher_id, electoral_table_id")
      .is("ended_at", null)
      .in("electoral_table_id", body.electoralTableIds);
  if (targetAssignmentsError) {
    return jsonResponse({ error: "No se pudieron comprobar las asignaciones actuales." }, 500);
  }

  const allowedExistingWatchers = new Set([
    body.watcherId,
    ...(body.replacingWatcherId ? [body.replacingWatcherId] : []),
  ]);
  if (
    (activeAssignments ?? []).some(
      (assignment: Pick<AssignmentRow, "watcher_id">) =>
        !allowedExistingWatchers.has(assignment.watcher_id),
    )
  ) {
    return jsonResponse(
      { error: "Una o más mesas ya están asignadas a otro veedor. Revisa las asignaciones actuales." },
      409,
    );
  }

  const alreadyAssigned = new Set(
    (activeAssignments ?? [])
      .filter(
        (assignment: Pick<AssignmentRow, "watcher_id" | "electoral_table_id">) =>
          assignment.watcher_id === body.watcherId,
      )
      .map(
        (assignment: Pick<AssignmentRow, "electoral_table_id">) =>
          assignment.electoral_table_id,
      ),
  );
  const assignmentsToInsert = body.electoralTableIds
    .filter((tableId) => !alreadyAssigned.has(tableId))
    .map((tableId) => ({
      watcher_id: body.watcherId,
      electoral_table_id: tableId,
      assigned_by: userId,
    }));

  let endedAt: string | null = null;
  if (previousAssignments.length > 0) {
    endedAt = new Date().toISOString();
    const { data: endedAssignments, error: endError } = await serviceSupabase
      .from("watcher_assignments")
      .update({
        ended_at: endedAt,
        ended_by: userId,
        end_reason: body.endReason,
      })
      .in(
        "id",
        previousAssignments.map((assignment) => assignment.id),
      )
      .is("ended_at", null)
      .select("id");
    if (endError || (endedAssignments ?? []).length !== previousAssignments.length) {
      return jsonResponse(
        { error: "No se pudieron cerrar todas las asignaciones anteriores." },
        409,
      );
    }
  }

  if (assignmentsToInsert.length > 0) {
    const { error: insertError } = await serviceSupabase
      .from("watcher_assignments")
      .insert(assignmentsToInsert);
    if (insertError) {
      if (previousAssignments.length > 0 && endedAt) {
        const { error: restoreError } = await serviceSupabase
          .from("watcher_assignments")
          .update({ ended_at: null, ended_by: null, end_reason: null })
          .in(
            "id",
            previousAssignments.map((assignment) => assignment.id),
          )
          .eq("ended_by", userId)
          .eq("ended_at", endedAt);
        if (restoreError) {
          return jsonResponse(
            {
              error:
                "Falló la nueva asignación y no se pudieron restaurar las anteriores. Contacta al administrador antes de reintentar.",
            },
            500,
          );
        }
      }
      return jsonResponse(
        { error: "No se pudieron guardar las nuevas asignaciones." },
        500,
      );
    }
  }

  return jsonResponse({
    assignedCount: assignmentsToInsert.length,
    endedCount: previousAssignments.length,
  });
}

const handler = withSupabase(
  { auth: "user" },
  async (
    req: Request,
    ctx: { supabase: ReturnType<typeof createClient> },
  ) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return jsonResponse({ error: "Debes iniciar sesión para continuar." }, 401);
  }

  const { data: authData, error: authError } = await ctx.supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "La sesión no es válida o expiró." }, 401);
  }

  const { data: active, error: activeError } = await ctx.supabase.rpc("is_active_user");
  if (activeError) {
    return jsonResponse({ error: "No se pudo validar el estado de la cuenta." }, 500);
  }
  if (active !== true) {
    return jsonResponse({ error: "La cuenta no está activa." }, 403);
  }

  const { data: role, error: roleError } = await ctx.supabase.rpc("get_my_role");
  if (roleError || typeof role !== "string") {
    return jsonResponse({ error: "No se pudo validar el rol de la cuenta." }, 500);
  }

  const { data: callerProfile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("id, province_id, polling_place_id, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  const parsedProfile = readProfileScope(callerProfile);
  if (profileError || !parsedProfile || parsedProfile.is_active !== true) {
    return jsonResponse({ error: "No se pudo validar el perfil y su jurisdicción." }, 403);
  }

  let requestValue: unknown;
  try {
    requestValue = await req.json();
  } catch {
    return jsonResponse({ error: "El cuerpo de la solicitud no es válido." }, 400);
  }
  const parsed = parseRequestBody(requestValue);
  if (isParseFailure(parsed)) {
    return jsonResponse(
      {
        error: parsed.error,
        ...(parsed.detail ? { detail: parsed.detail } : {}),
      },
      400,
    );
  }
  const body = parsed.body;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "La función no tiene configuradas las credenciales del servidor." },
      500,
    );
  }
  const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  if (body.action === "create_member") {
    return createMember(
      body,
      authData.user.id,
      role.trim().toLowerCase(),
      parsedProfile,
      serviceSupabase,
    );
  }

  return saveAssignments(
    body,
    authData.user.id,
    parsedProfile,
    role.trim().toLowerCase(),
    serviceSupabase,
  );
});

export default {
  fetch(req: Request): Promise<Response> | Response {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    return handler(req);
  },
};

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
  fullName: string;
  email: string;
  pollingPlaceId: number | null;
};

type SaveAssignmentsBody = {
  action: "save_assignments";
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

function parseRequestBody(value: unknown): RequestBody | null {
  if (!isRecord(value) || typeof value.action !== "string") {
    return null;
  }

  if (value.action === "create_member") {
    const allowedFields = new Set([
      "action",
      "role",
      "fullName",
      "email",
      "pollingPlaceId",
    ]);
    if (
      Object.keys(value).some((key) => !allowedFields.has(key)) ||
      (value.role !== "coordinador_recinto" && value.role !== "veedor") ||
      typeof value.fullName !== "string" ||
      !value.fullName.trim() ||
      value.fullName.trim().length > 160 ||
      typeof value.email !== "string" ||
      !emailPattern.test(value.email.trim()) ||
      value.email.trim().length > 254 ||
      (value.pollingPlaceId !== null &&
        (typeof value.pollingPlaceId !== "number" ||
          !Number.isSafeInteger(value.pollingPlaceId) ||
          value.pollingPlaceId <= 0))
    ) {
      return null;
    }

    return {
      action: "create_member",
      role: value.role,
      fullName: value.fullName.trim(),
      email: value.email.trim().toLowerCase(),
      pollingPlaceId: value.pollingPlaceId,
    };
  }

  if (value.action === "save_assignments") {
    const allowedFields = new Set([
      "action",
      "watcherId",
      "electoralTableIds",
      "replacingWatcherId",
      "endReason",
    ]);
    if (
      Object.keys(value).some((key) => !allowedFields.has(key)) ||
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
      return null;
    }

    const tableIds = [...new Set(value.electoralTableIds)];
    if (tableIds.length !== value.electoralTableIds.length) {
      return null;
    }

    return {
      action: "save_assignments",
      watcherId: value.watcherId.trim(),
      electoralTableIds: tableIds,
      replacingWatcherId: value.replacingWatcherId,
      endReason: value.endReason?.trim() || null,
    };
  }

  return null;
}

async function getRoleId(
  serviceSupabase: ReturnType<typeof createClient>,
  roleCode: string,
): Promise<number | null> {
  const { data, error } = await serviceSupabase
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (error || !data || typeof data.id !== "number") {
    return null;
  }
  return data.id;
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
    return { provinceId: null, failed: true };
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
    return { provinceId: null, failed: true };
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
    return { provinceId: null, failed: true };
  }
  if (!canton || typeof canton.province_id !== "number") {
    return { provinceId: null, failed: false };
  }

  return { provinceId: canton.province_id, failed: false };
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
      return jsonResponse({ error: "No se pudo validar la jurisdicción del recinto." }, 500);
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

  const roleId = await getRoleId(serviceSupabase, body.role);
  if (roleId === null) {
    return jsonResponse({ error: "No se pudo validar el rol solicitado." }, 500);
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

  const { error: profileError } = await serviceSupabase.from("profiles").insert({
    id: invitedUser.user.id,
    full_name: body.fullName,
    role_id: roleId,
    province_id: provinceId,
    polling_place_id: pollingPlaceId,
    created_by: userId,
    is_active: true,
  });

  if (profileError) {
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

  return jsonResponse({ invited: true }, 201);
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

  const watcherRoleId = await getRoleId(serviceSupabase, "veedor");
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
  const body = parseRequestBody(requestValue);
  if (!body) {
    return jsonResponse({ error: "Revisa los datos enviados." }, 400);
  }

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

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESPONSE_TYPES = new Set([
  "candidate",
  "blank",
  "null",
  "no_response",
]);

type Body = {
  electoralTableId: number;
  positionId: number;
  candidateId: number | null;
  responseType: "candidate" | "blank" | "null" | "no_response";
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

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

function parseBody(value: unknown): Body | null {
  if (!isRecord(value)) {
    return null;
  }
  const allowed = new Set([
    "electoralTableId",
    "positionId",
    "candidateId",
    "responseType",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return null;
  }
  if (
    !isPositiveInteger(value.electoralTableId) ||
    !isPositiveInteger(value.positionId) ||
    typeof value.responseType !== "string" ||
    !RESPONSE_TYPES.has(value.responseType)
  ) {
    return null;
  }
  if (
    value.candidateId !== null &&
    !isPositiveInteger(value.candidateId)
  ) {
    return null;
  }
  if (value.responseType === "candidate" && value.candidateId === null) {
    return null;
  }
  if (value.responseType !== "candidate" && value.candidateId !== null) {
    return null;
  }

  return {
    electoralTableId: value.electoralTableId,
    positionId: value.positionId,
    candidateId: value.candidateId as number | null,
    responseType: value.responseType as Body["responseType"],
  };
}

const handler = withSupabase(
  { auth: "user" },
  async (req: Request, ctx: { supabase: ReturnType<typeof createClient> }) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Método no permitido." }, 405);
    }

    const token =
      req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
      return jsonResponse({ error: "Debes iniciar sesión para continuar." }, 401);
    }

    const { data: authData, error: authError } = await ctx.supabase.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return jsonResponse({ error: "La sesión no es válida o expiró." }, 401);
    }

    const { data: active, error: activeError } = await ctx.supabase.rpc(
      "is_active_user",
    );
    if (activeError) {
      return jsonResponse(
        { error: "No se pudo validar el estado de la cuenta." },
        500,
      );
    }
    if (active !== true) {
      return jsonResponse({ error: "La cuenta no está activa." }, 403);
    }

    const { data: roleValue, error: roleError } = await ctx.supabase.rpc(
      "get_my_role",
    );
    if (roleError || typeof roleValue !== "string") {
      return jsonResponse({ error: "No se pudo validar el rol de la cuenta." }, 500);
    }
    const role = roleValue.trim().toLowerCase();
    if (
      role !== "coordinador_provincial" &&
      role !== "coordinador_recinto"
    ) {
      return jsonResponse(
        { error: "Solo los coordinadores pueden registrar el Exit Poll." },
        403,
      );
    }

    let requestValue: unknown;
    try {
      requestValue = await req.json();
    } catch {
      return jsonResponse({ error: "El cuerpo de la solicitud no es válido." }, 400);
    }
    const body = parseBody(requestValue);
    if (!body) {
      return jsonResponse({ error: "Revisa los datos del Exit Poll." }, 400);
    }

    const { data: tableRow, error: tableError } = await ctx.supabase
      .from("electoral_tables")
      .select("id, polling_place_id, polling_places ( id, parish_id, parishes ( id, canton_id, cantons ( id, province_id ) ) )")
      .eq("id", body.electoralTableId)
      .maybeSingle();
    if (tableError || !tableRow) {
      return jsonResponse(
        { error: "No se encontró la mesa electoral o no tienes acceso a ella." },
        404,
      );
    }

    const { data: profileRow, error: profileError } = await ctx.supabase
      .from("profiles")
      .select("id, province_id, polling_place_id, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError || !profileRow || profileRow.is_active !== true) {
      return jsonResponse(
        { error: "No se pudo validar la jurisdicción de tu cuenta." },
        403,
      );
    }

    if (role === "coordinador_recinto") {
      if (
        profileRow.polling_place_id === null ||
        profileRow.polling_place_id !== tableRow.polling_place_id
      ) {
        return jsonResponse(
          { error: "La mesa no pertenece a tu recinto." },
          403,
        );
      }
    } else {
      const pollingPlace = tableRow.polling_places as unknown;
      if (!isRecord(pollingPlace)) {
        return jsonResponse(
          { error: "No se pudo validar la jurisdicción de la mesa." },
          500,
        );
      }
      const parish = pollingPlace.parishes;
      if (!isRecord(parish)) {
        return jsonResponse(
          { error: "No se pudo validar la jurisdicción de la mesa." },
          500,
        );
      }
      const canton = parish.cantons;
      if (!isRecord(canton) || canton.province_id !== profileRow.province_id) {
        return jsonResponse(
          { error: "La mesa no pertenece a tu provincia." },
          403,
        );
      }
    }

    const { data: positionRow, error: positionError } = await ctx.supabase
      .from("electoral_positions")
      .select("id")
      .eq("id", body.positionId)
      .maybeSingle();
    if (positionError || !positionRow) {
      return jsonResponse(
        { error: "No se encontró la dignidad electoral." },
        404,
      );
    }

    if (body.candidateId !== null) {
      const { data: candidateRow, error: candidateError } = await ctx.supabase
        .from("candidates")
        .select("id, position_id")
        .eq("id", body.candidateId)
        .eq("position_id", body.positionId)
        .maybeSingle();
      if (candidateError || !candidateRow) {
        return jsonResponse(
          { error: "La candidatura no corresponde a la dignidad indicada." },
          400,
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
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: inserted, error: insertError } = await serviceSupabase
      .from("exit_poll_responses")
      .insert({
        electoral_table_id: body.electoralTableId,
        position_id: body.positionId,
        candidate_id: body.candidateId,
        response_type: body.responseType,
        registered_by: authData.user.id,
      })
      .select("id, created_at")
      .single();

    if (insertError || !inserted) {
      return jsonResponse(
        { error: "No se pudo registrar la respuesta del Exit Poll." },
        500,
      );
    }

    return jsonResponse({
      success: true,
      responseId: inserted.id,
      createdAt: inserted.created_at,
    });
  },
);

export default {
  fetch(req: Request): Promise<Response> | Response {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    return handler(req);
  },
};

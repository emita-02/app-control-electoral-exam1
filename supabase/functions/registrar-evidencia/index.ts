import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { withSupabase } from "@supabase/server";

const BUCKET = "act-evidence";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  actId: number;
  storagePath: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
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

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseBody(value: unknown): Body | null {
  if (!isRecord(value)) {
    return null;
  }

  const allowed = new Set([
    "actId",
    "storagePath",
    "latitude",
    "longitude",
    "capturedAt",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return null;
  }

  if (!isPositiveInteger(value.actId)) {
    return null;
  }
  if (
    typeof value.storagePath !== "string" ||
    !/^[0-9]+\/[0-9a-fA-F-]{36}\.jpg$/.test(value.storagePath) ||
    !value.storagePath.startsWith(`${value.actId}/`)
  ) {
    return null;
  }
  if (typeof value.capturedAt !== "string" || !value.capturedAt.trim()) {
    return null;
  }
  if (Number.isNaN(Date.parse(value.capturedAt))) {
    return null;
  }

  const latitude = value.latitude;
  const longitude = value.longitude;
  if ((latitude === null) !== (longitude === null)) {
    return null;
  }
  if (
    latitude !== null &&
    (!isCoordinate(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !isCoordinate(longitude) ||
      longitude === null ||
      longitude < -180 ||
      longitude > 180)
  ) {
    return null;
  }

  return {
    actId: value.actId,
    storagePath: value.storagePath,
    latitude: latitude as number | null,
    longitude: longitude as number | null,
    capturedAt: value.capturedAt,
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

    const { data: role, error: roleError } = await ctx.supabase.rpc(
      "get_my_role",
    );
    if (
      roleError ||
      typeof role !== "string" ||
      role.trim().toLowerCase() !== "veedor"
    ) {
      return jsonResponse(
        { error: "Solo los veedores pueden registrar evidencias." },
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
      return jsonResponse({ error: "Revisa los datos de la evidencia." }, 400);
    }

    const { data: act, error: actError } = await ctx.supabase
      .from("electoral_acts")
      .select("id, electoral_table_id, registered_by")
      .eq("id", body.actId)
      .maybeSingle();
    if (actError || !act) {
      return jsonResponse(
        { error: "No se encontró el acta o no tienes acceso a ella." },
        404,
      );
    }

    const { data: assignment, error: assignmentError } = await ctx.supabase
      .from("watcher_assignments")
      .select("id")
      .eq("watcher_id", authData.user.id)
      .eq("electoral_table_id", act.electoral_table_id)
      .is("ended_at", null)
      .limit(1)
      .maybeSingle();
    if (assignmentError || !assignment) {
      return jsonResponse(
        { error: "No tienes una asignación activa a la mesa de esta acta." },
        403,
      );
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

    const { data: existing, error: existingError } = await serviceSupabase
      .from("act_evidence")
      .select("id")
      .eq("storage_path", body.storagePath)
      .maybeSingle();
    if (existingError) {
      return jsonResponse(
        { error: "No se pudo comprobar la evidencia registrada." },
        500,
      );
    }
    if (existing) {
      return jsonResponse({
        success: true,
        evidenceId: existing.id,
        storagePath: body.storagePath,
        alreadyRegistered: true,
      });
    }

    const { data: file, error: fileError } = await serviceSupabase.storage
      .from(BUCKET)
      .download(body.storagePath);
    if (fileError || !file || file.size === 0) {
      return jsonResponse(
        { error: "No se encontró la fotografía cargada en el almacenamiento." },
        404,
      );
    }

    const { data: inserted, error: insertError } = await serviceSupabase
      .from("act_evidence")
      .insert({
        act_id: body.actId,
        uploaded_by: authData.user.id,
        storage_path: body.storagePath,
        evidence_type: "foto_acta",
        latitude: body.latitude,
        longitude: body.longitude,
        captured_at: body.capturedAt,
        uploaded_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return jsonResponse(
        { error: "No se pudo registrar la evidencia." },
        500,
      );
    }

    return jsonResponse({
      success: true,
      evidenceId: inserted.id,
      storagePath: body.storagePath,
      alreadyRegistered: false,
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

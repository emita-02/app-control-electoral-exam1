import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreatePollingPlaceBody = {
  parishId: number;
  name: string;
  code: string | null;
  address: string | null;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(value: unknown): CreatePollingPlaceBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const allowedFields = new Set(["parishId", "name", "code", "address"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    return null;
  }

  if (
    typeof value.parishId !== "number" ||
    !Number.isSafeInteger(value.parishId) ||
    value.parishId <= 0 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    (value.code !== undefined &&
      value.code !== null &&
      typeof value.code !== "string") ||
    (value.address !== undefined &&
      value.address !== null &&
      typeof value.address !== "string")
  ) {
    return null;
  }

  return {
    parishId: value.parishId,
    name: value.name.trim(),
    code: typeof value.code === "string" ? value.code.trim() || null : null,
    address:
      typeof value.address === "string" ? value.address.trim() || null : null,
  };
}

const handler = withSupabase(
  { auth: "user" },
  async (req, ctx) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Método no permitido." }, 405);
    }

    const authorization = req.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
      return jsonResponse({ error: "Debes iniciar sesión para continuar." }, 401);
    }

    const { data: authData, error: authError } =
      await ctx.supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse({ error: "La sesión no es válida o expiró." }, 401);
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return jsonResponse({ error: "El cuerpo de la solicitud no es válido." }, 400);
    }

    const body = parseBody(requestBody);
    if (!body) {
      return jsonResponse(
        { error: "Revisa los datos del recinto y la parroquia seleccionada." },
        400,
      );
    }

    const { data: activeUser, error: activeError } =
      await ctx.supabase.rpc("is_active_user");
    if (activeError) {
      return jsonResponse({ error: "No se pudo validar el estado de la cuenta." }, 500);
    }
    if (activeUser !== true) {
      return jsonResponse({ error: "La cuenta no está activa." }, 403);
    }

    const { data: role, error: roleError } =
      await ctx.supabase.rpc("get_my_role");
    if (roleError) {
      return jsonResponse({ error: "No se pudo validar el rol de la cuenta." }, 500);
    }
    if (
      typeof role !== "string" ||
      role.trim().toLowerCase() !== "coordinador_provincial"
    ) {
      return jsonResponse(
        { error: "Solo el coordinador provincial puede registrar recintos." },
        403,
      );
    }

    const { data: profile, error: profileError } = await ctx.supabase
      .from("profiles")
      .select("id, province_id, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ error: "No se pudo validar la jurisdicción." }, 500);
    }
    if (
      !profile ||
      profile.id !== authData.user.id ||
      profile.is_active !== true ||
      typeof profile.province_id !== "number" ||
      !Number.isSafeInteger(profile.province_id)
    ) {
      return jsonResponse(
        { error: "La cuenta no tiene una provincia activa asignada." },
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
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: parish, error: parishError } = await serviceSupabase
      .from("parishes")
      .select("canton_id")
      .eq("id", body.parishId)
      .maybeSingle();

    if (parishError) {
      return jsonResponse({ error: "No se pudo validar la parroquia." }, 500);
    }
    if (!parish) {
      return jsonResponse({ error: "La parroquia seleccionada no existe." }, 404);
    }

    const { data: canton, error: cantonError } = await serviceSupabase
      .from("cantons")
      .select("province_id")
      .eq("id", parish.canton_id)
      .maybeSingle();

    if (cantonError || !canton) {
      return jsonResponse({ error: "No se pudo validar la provincia de la parroquia." }, 500);
    }
    if (canton.province_id !== profile.province_id) {
      return jsonResponse(
        { error: "La parroquia seleccionada no pertenece a tu provincia." },
        403,
      );
    }

    const { data: pollingPlace, error: insertError } = await serviceSupabase
      .from("polling_places")
      .insert({
        parish_id: body.parishId,
        name: body.name,
        code: body.code,
        address: body.address,
      })
      .select("id, code, name, address")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return jsonResponse(
          { error: "Ya existe un recinto con ese código en la parroquia." },
          409,
        );
      }
      return jsonResponse({ error: "No se pudo guardar el recinto." }, 500);
    }
    if (
      !pollingPlace ||
      typeof pollingPlace.id !== "number" ||
      !Number.isSafeInteger(pollingPlace.id)
    ) {
      return jsonResponse({ error: "El servidor no confirmó el recinto registrado." }, 500);
    }

    return jsonResponse(
      {
        pollingPlace: {
          id: pollingPlace.id,
          code: pollingPlace.code,
          name: pollingPlace.name,
          address: pollingPlace.address,
        },
      },
      201,
    );
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

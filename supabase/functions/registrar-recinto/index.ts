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
  tableCount: number;
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

  const allowedFields = new Set([
    "parishId",
    "name",
    "code",
    "address",
    "tableCount",
  ]);
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
      typeof value.address !== "string") ||
    typeof value.tableCount !== "number" ||
    !Number.isSafeInteger(value.tableCount) ||
    value.tableCount < 1 ||
    value.tableCount > 100
  ) {
    return null;
  }

  return {
    parishId: value.parishId,
    name: value.name.trim(),
    code: typeof value.code === "string" ? value.code.trim() || null : null,
    address:
      typeof value.address === "string" ? value.address.trim() || null : null,
    tableCount: value.tableCount,
  };
}

type CreatedPollingPlace = {
  id: number;
  code: string | null;
  name: string;
  address: string | null;
  electoral_tables: Array<{ id: number; table_number: number }>;
};

// Contrato de la RPC: { id, code, name, address,
// electoral_tables: [{ id, table_number }] }. Se reenvía tal cual dentro de
// { pollingPlace } porque el repositorio lee esos mismos nombres (snake_case).
function parseRpcResult(
  value: unknown,
  expectedTables: number,
): CreatedPollingPlace | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, code, name, address, electoral_tables: tables } = value;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof name !== "string" ||
    !name.trim() ||
    (code !== null && typeof code !== "string") ||
    (address !== null && typeof address !== "string") ||
    !Array.isArray(tables) ||
    tables.length !== expectedTables
  ) {
    return null;
  }

  const electoralTables: Array<{ id: number; table_number: number }> = [];
  for (const item of tables) {
    if (!isRecord(item)) {
      return null;
    }
    const { id: tableId, table_number: tableNumber } = item;
    if (
      typeof tableId !== "number" ||
      !Number.isSafeInteger(tableId) ||
      typeof tableNumber !== "number" ||
      !Number.isSafeInteger(tableNumber)
    ) {
      return null;
    }
    electoralTables.push({ id: tableId, table_number: tableNumber });
  }

  const numbers = electoralTables
    .map((table) => table.table_number)
    .sort((a, b) => a - b);
  for (let index = 0; index < expectedTables; index += 1) {
    if (numbers[index] !== index + 1) {
      return null;
    }
  }

  return {
    id,
    code,
    name: name.trim(),
    address,
    electoral_tables: electoralTables,
  };
}

// Los mensajes de PostgreSQL pueden contener nombres de tablas, restricciones
// o fingerprinting interno. Se devuelve un mensaje seguro por SQLSTATE y el
// error completo queda en los logs del servidor.
function rpcErrorResponse(code: string | undefined): {
  error: string;
  status: number;
} {
  switch (code) {
    case "23505":
      return {
        error: "Ya existe un recinto con ese código en la parroquia.",
        status: 409,
      };
    case "42501":
      return {
        error: "No tienes permiso para registrar el recinto en esa parroquia.",
        status: 403,
      };
    case "22023":
      return {
        error: "Revisa los datos del recinto y la cantidad de mesas (de 1 a 100).",
        status: 400,
      };
    default:
      return {
        error: "No se pudo guardar el recinto y sus mesas.",
        status: 500,
      };
  }
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
        {
          error:
            "Revisa los datos del recinto, la parroquia y la cantidad de mesas (de 1 a 100).",
        },
        400,
      );
    }

    const { data: activeUser, error: activeError } =
      await ctx.supabase.rpc("is_active_user");
    if (activeError) {
      console.error("registrar-recinto: falló is_active_user", activeError);
      return jsonResponse(
        {
          error: "No se pudo validar el estado de la cuenta.",
          detail: activeError.message ?? "error en RPC is_active_user",
        },
        500,
      );
    }
    if (activeUser !== true) {
      return jsonResponse({ error: "La cuenta no está activa." }, 403);
    }

    const { data: role, error: roleError } =
      await ctx.supabase.rpc("get_my_role");
    if (roleError) {
      console.error("registrar-recinto: falló get_my_role", roleError);
      return jsonResponse(
        {
          error: "No se pudo validar el rol de la cuenta.",
          detail: roleError.message ?? "error en RPC get_my_role",
        },
        500,
      );
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
      console.error("registrar-recinto: falló consulta de profiles", profileError);
      return jsonResponse(
        {
          error: "No se pudo validar la jurisdicción.",
          detail: profileError.message ?? "error al consultar el perfil",
        },
        500,
      );
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
      console.error("registrar-recinto: falló consulta de parishes", parishError);
      return jsonResponse(
        {
          error: "No se pudo validar la parroquia.",
          detail: parishError.message ?? "error al consultar parishes",
        },
        500,
      );
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
      if (cantonError) {
        console.error("registrar-recinto: falló consulta de cantons", cantonError);
      }
      return jsonResponse(
        {
          error: "No se pudo validar la provincia de la parroquia.",
          detail:
            cantonError?.message ??
            (canton ? undefined : "no se encontró el cantón de la parroquia"),
        },
        500,
      );
    }
    if (canton.province_id !== profile.province_id) {
      return jsonResponse(
        { error: "La parroquia seleccionada no pertenece a tu provincia." },
        403,
      );
    }

    const { data: created, error: rpcError } = await ctx.supabase.rpc(
      "registrar_recinto_con_mesas",
      {
        p_parish_id: body.parishId,
        p_name: body.name,
        p_code: body.code,
        p_address: body.address,
        p_table_count: body.tableCount,
      },
    );

    if (rpcError) {
      const rpcCode =
        isRecord(rpcError) && typeof rpcError.code === "string"
          ? rpcError.code
          : undefined;
      console.error("registrar-recinto: falló registrar_recinto_con_mesas", {
        code: rpcCode,
        error: rpcError,
      });
      const { error, status } = rpcErrorResponse(rpcCode);
      return jsonResponse({ error }, status);
    }

    const pollingPlace = parseRpcResult(created, body.tableCount);
    if (!pollingPlace) {
      return jsonResponse(
        { error: "El servidor no confirmó el recinto y todas sus mesas." },
        500,
      );
    }

    return jsonResponse({ pollingPlace }, 201);
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

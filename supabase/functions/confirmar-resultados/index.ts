import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VoteInput = { candidateId: number; votes: number };
type Body = {
  action: "confirm_ocr" | "apply_correction";
  actId: number;
  candidateVotes: VoteInput[];
  blankVotes: number;
  nullVotes: number;
  totalVotes: number;
  observation: string | null;
  reason: string;
  ocrData: Record<string, unknown> | null;
};

type ActSnapshot = {
  status: string;
  totalVotes: number;
  blankVotes: number;
  nullVotes: number;
  observation: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  ocrData: unknown;
  ocrProcessedAt: string | null;
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

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function parseBody(value: unknown): Body | null {
  if (!isRecord(value)) {
    return null;
  }

  const allowed = new Set([
    "action",
    "actId",
    "candidateVotes",
    "blankVotes",
    "nullVotes",
    "totalVotes",
    "observation",
    "reason",
    "ocrData",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return null;
  }

  if (
    value.action !== "confirm_ocr" &&
    value.action !== "apply_correction"
  ) {
    return null;
  }
  if (!isPositiveInteger(value.actId)) {
    return null;
  }
  if (
    !isNonNegativeInteger(value.blankVotes) ||
    !isNonNegativeInteger(value.nullVotes) ||
    !isNonNegativeInteger(value.totalVotes)
  ) {
    return null;
  }
  if (!Array.isArray(value.candidateVotes) || value.candidateVotes.length === 0) {
    return null;
  }

  const candidateVotes: VoteInput[] = [];
  for (const item of value.candidateVotes) {
    if (
      !isRecord(item) ||
      !isPositiveInteger(item.candidateId) ||
      !isNonNegativeInteger(item.votes)
    ) {
      return null;
    }
    candidateVotes.push({
      candidateId: item.candidateId,
      votes: item.votes,
    });
  }

  if (
    value.observation !== null &&
    (typeof value.observation !== "string" || value.observation.length > 2000)
  ) {
    return null;
  }
  if (typeof value.reason !== "string" || !value.reason.trim()) {
    return null;
  }
  if (value.reason.trim().length > 1000) {
    return null;
  }
  if (value.ocrData !== null && !isRecord(value.ocrData)) {
    return null;
  }

  return {
    action: value.action,
    actId: value.actId,
    candidateVotes,
    blankVotes: value.blankVotes,
    nullVotes: value.nullVotes,
    totalVotes: value.totalVotes,
    observation: value.observation as string | null,
    reason: value.reason.trim(),
    ocrData: value.ocrData as Record<string, unknown> | null,
  };
}

function snapshotValues(body: Body) {
  return {
    candidateVotes: body.candidateVotes.map((candidate) => ({
      candidateId: candidate.candidateId,
      votes: candidate.votes,
    })),
    blankVotes: body.blankVotes,
    nullVotes: body.nullVotes,
    totalVotes: body.totalVotes,
    observation: body.observation,
  };
}

function snapshotChanged(body: Body, act: ActSnapshot, currentResults: {
  candidate_id: number;
  votes: number;
}[]): boolean {
  if (
    act.totalVotes !== body.totalVotes ||
    act.blankVotes !== body.blankVotes ||
    act.nullVotes !== body.nullVotes ||
    (act.observation ?? "") !== (body.observation ?? "")
  ) {
    return true;
  }

  const current = new Map(
    currentResults.map((result) => [result.candidate_id, result.votes]),
  );
  if (current.size !== body.candidateVotes.length) {
    return true;
  }

  return body.candidateVotes.some(
    (candidate) => current.get(candidate.candidateId) !== candidate.votes,
  );
}

async function restoreSnapshot(
  serviceSupabase: ReturnType<typeof createClient>,
  actId: number,
  positionId: number,
  snapshot: ActSnapshot,
  previousResults: { candidate_id: number; position_id: number; votes: number }[],
): Promise<void> {
  await serviceSupabase
    .from("electoral_acts")
    .update({ status: "borrador" })
    .eq("id", actId);

  if (previousResults.length > 0) {
    await serviceSupabase.from("act_results").upsert(
      previousResults.map((result) => ({
        act_id: actId,
        position_id: result.position_id,
        candidate_id: result.candidate_id,
        votes: result.votes,
      })),
      { onConflict: "act_id,candidate_id" },
    );
  }

  await serviceSupabase
    .from("electoral_acts")
    .update({
      status: snapshot.status,
      total_votes: snapshot.totalVotes,
      blank_votes: snapshot.blankVotes,
      null_votes: snapshot.nullVotes,
      observation: snapshot.observation,
      reviewed_by: snapshot.reviewedBy,
      reviewed_at: snapshot.reviewedAt,
      submitted_at: snapshot.submittedAt,
      ocr_data: snapshot.ocrData,
      ocr_processed_at: snapshot.ocrProcessedAt,
    })
    .eq("id", actId)
    .eq("position_id", positionId);
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

    let requestValue: unknown;
    try {
      requestValue = await req.json();
    } catch {
      return jsonResponse({ error: "El cuerpo de la solicitud no es válido." }, 400);
    }
    const body = parseBody(requestValue);
    if (!body) {
      return jsonResponse({ error: "Revisa los valores enviados." }, 400);
    }
    if (body.action === "confirm_ocr" && role !== "veedor") {
      return jsonResponse(
        { error: "Solo el veedor puede confirmar resultados del OCR." },
        403,
      );
    }
    if (
      body.action === "apply_correction" &&
      role !== "veedor" &&
      role !== "coordinador_recinto"
    ) {
      return jsonResponse(
        { error: "No tienes autorización para corregir actas." },
        403,
      );
    }

    const { data: actRow, error: actError } = await ctx.supabase
      .from("electoral_acts")
      .select(
        "id, electoral_table_id, position_id, registered_by, status, total_votes, blank_votes, null_votes, observation, reviewed_by, reviewed_at, submitted_at, ocr_data, ocr_processed_at",
      )
      .eq("id", body.actId)
      .maybeSingle();
    if (actError || !actRow) {
      return jsonResponse(
        { error: "No se encontró el acta o no tienes acceso a ella." },
        404,
      );
    }

    if (role === "veedor") {
      if (actRow.registered_by !== authData.user.id) {
        return jsonResponse(
          { error: "Solo puedes confirmar o corregir tus propias actas." },
          403,
        );
      }
      const { data: assignment, error: assignmentError } = await ctx.supabase
        .from("watcher_assignments")
        .select("id")
        .eq("watcher_id", authData.user.id)
        .eq("electoral_table_id", actRow.electoral_table_id)
        .is("ended_at", null)
        .limit(1)
        .maybeSingle();
      if (assignmentError || !assignment) {
        return jsonResponse(
          { error: "No tienes una asignación activa a la mesa de esta acta." },
          403,
        );
      }
    } else {
      const { data: tableRow, error: tableError } = await ctx.supabase
        .from("electoral_tables")
        .select("id, polling_place_id")
        .eq("id", actRow.electoral_table_id)
        .maybeSingle();
      const { data: profileRow, error: profileError } = await ctx.supabase
        .from("profiles")
        .select("id, polling_place_id, is_active")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (
        tableError ||
        !tableRow ||
        profileError ||
        !profileRow ||
        profileRow.is_active !== true ||
        profileRow.polling_place_id === null ||
        profileRow.polling_place_id !== tableRow.polling_place_id
      ) {
        return jsonResponse(
          { error: "El acta no pertenece a tu recinto." },
          403,
        );
      }
    }

    const { data: candidates, error: candidatesError } = await ctx.supabase
      .from("candidates")
      .select("id")
      .eq("position_id", actRow.position_id);
    if (candidatesError || !candidates || candidates.length === 0) {
      return jsonResponse(
        { error: "No se pudo validar el catálogo de candidaturas del acta." },
        500,
      );
    }

    const officialIds = new Set(
      candidates.map((candidate) => Number(candidate.id)),
    );
    const receivedIds = new Set<number>();
    for (const candidate of body.candidateVotes) {
      if (!officialIds.has(candidate.candidateId) || receivedIds.has(candidate.candidateId)) {
        return jsonResponse(
          { error: "Las candidaturas enviadas no coinciden con el acta." },
          400,
        );
      }
      receivedIds.add(candidate.candidateId);
    }
    if (receivedIds.size !== officialIds.size) {
      return jsonResponse(
        { error: "Debes enviar una valor para cada candidatura oficial." },
        400,
      );
    }

    const candidateSum = body.candidateVotes.reduce(
      (sum, candidate) => sum + candidate.votes,
      0,
    );
    if (!Number.isSafeInteger(candidateSum)) {
      return jsonResponse(
        { error: "La suma de votos excede el rango permitido." },
        400,
      );
    }
    if (candidateSum + body.blankVotes + body.nullVotes !== body.totalVotes) {
      return jsonResponse(
        {
          error:
            "La suma de votos por candidatura, blancos y nulos debe coincidir con el total.",
        },
        400,
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

    const { data: currentResults, error: currentResultsError } =
      await serviceSupabase
        .from("act_results")
        .select("candidate_id, position_id, votes")
        .eq("act_id", body.actId);
    if (currentResultsError || !currentResults) {
      return jsonResponse(
        { error: "No se pudo leer los resultados actuales del acta." },
        500,
      );
    }

    const snapshot: ActSnapshot = {
      status: String(actRow.status),
      totalVotes: Number(actRow.total_votes),
      blankVotes: Number(actRow.blank_votes),
      nullVotes: Number(actRow.null_votes),
      observation:
        actRow.observation === null ? null : String(actRow.observation),
      reviewedBy:
        actRow.reviewed_by === null ? null : String(actRow.reviewed_by),
      reviewedAt:
        actRow.reviewed_at === null ? null : String(actRow.reviewed_at),
      submittedAt:
        actRow.submitted_at === null ? null : String(actRow.submitted_at),
      ocrData: actRow.ocr_data,
      ocrProcessedAt:
        actRow.ocr_processed_at === null
          ? null
          : String(actRow.ocr_processed_at),
    };

    const currentResultsForCompare = currentResults.map((row) => ({
      candidate_id: Number(row.candidate_id),
      votes: Number(row.votes),
    }));
    const changed = snapshotChanged(body, snapshot, currentResultsForCompare);
    const timestamp = new Date().toISOString();
    const previousData = {
      candidateVotes: currentResultsForCompare.map((row) => ({
        candidateId: row.candidate_id,
        votes: row.votes,
      })),
      blankVotes: snapshot.blankVotes,
      nullVotes: snapshot.nullVotes,
      totalVotes: snapshot.totalVotes,
      observation: snapshot.observation,
    };
    const correctedData = snapshotValues(body);

    let committed = false;
    try {
      const unlock = await serviceSupabase
        .from("electoral_acts")
        .update({ status: "borrador" })
        .eq("id", body.actId)
        .eq("position_id", actRow.position_id);
      if (unlock.error) {
        throw unlock.error;
      }

      const resultsError = await serviceSupabase.from("act_results").upsert(
        body.candidateVotes.map((candidate) => ({
          act_id: body.actId,
          position_id: actRow.position_id,
          candidate_id: candidate.candidateId,
          votes: candidate.votes,
          updated_at: timestamp,
        })),
        { onConflict: "act_id,candidate_id" },
      );
      if (resultsError.error) {
        throw resultsError.error;
      }

      const updateError = await serviceSupabase
        .from("electoral_acts")
        .update({
          status: "aprobada",
          total_votes: body.totalVotes,
          blank_votes: body.blankVotes,
          null_votes: body.nullVotes,
          observation: body.observation,
          reviewed_by: authData.user.id,
          reviewed_at: timestamp,
          submitted_at: timestamp,
          ocr_data: body.action === "confirm_ocr" ? body.ocrData : actRow.ocr_data,
          ocr_processed_at:
            body.action === "confirm_ocr" ? timestamp : actRow.ocr_processed_at,
        })
        .eq("id", body.actId)
        .eq("position_id", actRow.position_id);
      if (updateError.error) {
        throw updateError.error;
      }

      if (changed) {
        const correctionError = await serviceSupabase
          .from("act_corrections")
          .insert({
            act_id: body.actId,
            corrected_by: authData.user.id,
            previous_data: previousData,
            corrected_data: correctedData,
            correction_reason: body.reason,
            corrected_at: timestamp,
          });
        if (correctionError.error) {
          throw correctionError.error;
        }
      }

      committed = true;
    } catch (error) {
      if (!committed) {
        await restoreSnapshot(
          serviceSupabase,
          body.actId,
          Number(actRow.position_id),
          snapshot,
          currentResults as {
            candidate_id: number;
            position_id: number;
            votes: number;
          }[],
        );
      }
      return jsonResponse(
        {
          error:
            error instanceof Error && error.message
              ? `No se pudo guardar la confirmación: ${error.message}`
              : "No se pudo guardar la confirmación.",
        },
        500,
      );
    }

    return jsonResponse({
      success: true,
      actId: body.actId,
      status: "aprobada",
      reviewedBy: authData.user.id,
      reviewedAt: timestamp,
      correctionRegistered: changed,
      action: body.action,
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

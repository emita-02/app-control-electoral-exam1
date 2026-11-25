
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const GEMINI_MODEL = "gemini-2.5-flash";
const STORAGE_BUCKET = "act-evidence";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 45_000;

interface CandidateRow {
  id: number | string;
  full_name: string;
  organization_id: number | string;
}

interface OrganizationRow {
  id: number | string;
  name: string;
}

interface OcrCandidate {
  candidate_id: string;
  votes: number | null;
  readable: boolean;
}

interface OcrResponse {
  candidates: OcrCandidate[];
  blank_votes: number | null;
  null_votes: number | null;
  total_votes: number | null;
  warnings: string[];
}

interface OfficialCandidate {
  id: string;
  name: string;
  organization: string;
}

function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status },
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isValidVote(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isNullableVote(value: unknown): value is number | null {
  return value === null || isValidVote(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function parseGeminiJson(text: string): OcrResponse {
  const cleanedText = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const parsed: unknown = JSON.parse(cleanedText);

  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    throw new Error("La respuesta de Gemini no tiene la estructura esperada.");
  }

  if (
    !isNullableVote(parsed.blank_votes) ||
    !isNullableVote(parsed.null_votes) ||
    !isNullableVote(parsed.total_votes) ||
    !Array.isArray(parsed.warnings)
  ) {
    throw new Error("Gemini devolvió campos incompletos o inválidos.");
  }

  const rawCandidates: unknown[] = parsed.candidates;
  const warnings: string[] = parsed.warnings.map((warning: unknown) => {
    if (typeof warning !== "string") {
      throw new Error("Gemini devolvió una observación inválida.");
    }
    return warning;
  });
  const candidates: OcrCandidate[] = [];

  for (const item of rawCandidates) {
    if (!isRecord(item)) {
      throw new Error("Gemini devolvió un candidato con estructura inválida.");
    }

    if (
      typeof item.candidate_id !== "string" ||
      item.candidate_id.trim().length === 0 ||
      !isNullableVote(item.votes) ||
      typeof item.readable !== "boolean" ||
      (item.readable && item.votes === null) ||
      (!item.readable && item.votes !== null)
    ) {
      throw new Error("Gemini devolvió datos inválidos para un candidato.");
    }

    candidates.push({
      candidate_id: item.candidate_id,
      votes: item.votes,
      readable: item.readable,
    });
  }

  return {
    candidates,
    blank_votes: parsed.blank_votes,
    null_votes: parsed.null_votes,
    total_votes: parsed.total_votes,
    warnings,
  };
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req: Request, ctx) => {
      try {
        // 1. Validar método HTTP.
        if (req.method !== "POST") {
          return jsonError("Método no permitido.", 405);
        }

        // 2. Obtener identidad del usuario autenticado.
        const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;

        if (!userId) {
          return new Response(
            JSON.stringify({
              error: "No se pudo identificar al usuario.",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // 3. Validar los datos recibidos.
        let body: unknown;

        try {
          body = await req.json();
        } catch {
          return jsonError("El cuerpo de la solicitud no es válido.", 400);
        }

        if (
          !isRecord(body) ||
          !isPositiveSafeInteger(body.actId) ||
          !isPositiveSafeInteger(body.evidenceId)
        ) {
          return jsonError(
            "Debes proporcionar un actId y evidenceId válidos.",
            400,
          );
        }

        // 4. Comprobar que el usuario esté activo.
        const { data: activeUser, error: activeUserError } =
          await ctx.supabase.rpc("is_active_user");

        if (activeUserError || activeUser !== true) {
          return jsonError(
            "El usuario no está activo o no tiene autorización.",
            403,
          );
        }

        // 5. Comprobar que el usuario tenga el rol de veedor.
        const { data: userRole, error: roleError } =
          await ctx.supabase.rpc("get_my_role");

        if (
          roleError ||
          typeof userRole !== "string" ||
          userRole.trim().toLowerCase() !== "veedor"
        ) {
          return jsonError(
            "Solo los veedores pueden procesar actas mediante OCR.",
            403,
          );
        }

        // 6. Consultar el acta usando el cliente sujeto a RLS.
        const { data: act, error: actError } = await ctx.supabase
          .from("electoral_acts")
          .select("id, electoral_table_id, position_id")
          .eq("id", body.actId)
          .maybeSingle();

        if (actError || !act) {
          return jsonError(
            "No se encontró el acta o no tienes acceso a ella.",
            404,
          );
        }

        // 7. Comprobar que el veedor tenga una asignación vigente
        // a la mesa correspondiente al acta.
        const { data: assignment, error: assignmentError } =
          await ctx.supabase
            .from("watcher_assignments")
            .select("id")
            .eq("watcher_id", userId)
            .eq("electoral_table_id", act.electoral_table_id)
            .is("ended_at", null)
            .limit(1)
            .maybeSingle();

        if (assignmentError || !assignment) {
          return jsonError(
            "No tienes una asignación activa a la mesa de esta acta.",
            403,
          );
        }

        // 8. Comprobar que la evidencia pertenezca al acta solicitada.
        const { data: evidence, error: evidenceError } =
          await ctx.supabase
            .from("act_evidence")
            .select("id, act_id, storage_path")
            .eq("id", body.evidenceId)
            .eq("act_id", body.actId)
            .maybeSingle();

        if (evidenceError || !evidence) {
          return jsonError(
            "No se encontró la evidencia asociada a esta acta.",
            404,
          );
        }

        // 9. Consultar la dignidad electoral.
        const { data: position, error: positionError } =
          await ctx.supabase
            .from("electoral_positions")
            .select("id, code, name")
            .eq("id", act.position_id)
            .maybeSingle();

        if (positionError || !position) {
          return jsonError(
            "No se encontró la dignidad electoral del acta.",
            404,
          );
        }

        // 10. Consultar los candidatos oficiales de esa dignidad.
        const { data: candidateData, error: candidatesError } =
          await ctx.supabase
            .from("candidates")
            .select("id, full_name, organization_id")
            .eq("position_id", act.position_id);

        if (candidatesError || !candidateData || candidateData.length === 0) {
          return jsonError(
            "No se encontraron candidatos registrados para esta dignidad.",
            404,
          );
        }

        const candidateRows = candidateData as CandidateRow[];

        const organizationIds = [
          ...new Set(
            candidateRows.map((candidate: CandidateRow) =>
              String(candidate.organization_id)
            ),
          ),
        ];

        // 11. Consultar las organizaciones políticas.
        const { data: organizationData, error: organizationsError } =
          await ctx.supabase
            .from("political_organizations")
            .select("id, name")
            .in("id", organizationIds);

        if (organizationsError || !organizationData) {
          return jsonError(
            "No se pudieron consultar las organizaciones políticas.",
            500,
          );
        }

        const organizations = organizationData as OrganizationRow[];

        const organizationMap = new Map<string, string>(
          organizations.map((organization: OrganizationRow) => [
            String(organization.id),
            organization.name,
          ]),
        );

        const officialCandidates: OfficialCandidate[] =
          candidateRows.map((candidate: CandidateRow) => ({
            id: String(candidate.id),
            name: candidate.full_name,
            organization:
              organizationMap.get(String(candidate.organization_id)) ??
              "Organización no identificada",
          }));

        // 12. Descargar la fotografía desde el bucket privado.
        const { data: image, error: imageError } =
          await ctx.supabase.storage
            .from(STORAGE_BUCKET)
            .download(evidence.storage_path);

        if (imageError || !image) {
          return jsonError(
            "No se pudo descargar la fotografía del acta.",
            404,
          );
        }

        // 13. Validar tamaño y formato real de la imagen.
        if (image.size === 0 || image.size > MAX_IMAGE_SIZE) {
          return jsonError(
            "La fotografía está vacía o supera el límite de 10 MB.",
            400,
          );
        }

        const imageBytes = new Uint8Array(await image.arrayBuffer());

        if (!isJpeg(imageBytes)) {
          return jsonError(
            "La evidencia no tiene un formato JPEG válido.",
            400,
          );
        }

        const imageBase64 = bytesToBase64(imageBytes);

        // 14. Obtener la clave privada de Gemini.
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

        if (!geminiApiKey) {
          return jsonError(
            "No está configurada la clave de Gemini en Supabase.",
            500,
          );
        }

        // 15. Construir el catálogo oficial para evitar candidatos inventados.
        const candidateCatalog = officialCandidates.map((candidate) => ({
          candidate_id: candidate.id,
          candidate_name: candidate.name,
          political_organization: candidate.organization,
        }));

        const prompt = `
Eres un sistema de reconocimiento OCR especializado en actas electorales.

Debes analizar cuidadosamente la fotografía proporcionada y extraer los
resultados correspondientes a la siguiente dignidad electoral:

${position.name} (${position.code}).

CATÁLOGO OFICIAL DE CANDIDATOS:
${JSON.stringify(candidateCatalog, null, 2)}

INSTRUCCIONES:

1. Identifica los votos registrados para cada candidato del catálogo oficial.
2. Utiliza exclusivamente los candidate_id proporcionados.
3. No inventes candidatos, nombres, identificadores ni cantidades.
4. Incluye todos los candidatos oficiales, incluso si no puedes leer sus votos.
5. Si un valor es ilegible, dudoso o no aparece claramente, devuelve null.
6. readable debe ser true únicamente cuando el valor del candidato pueda
   leerse con suficiente claridad.
   Si readable es false, votes debe ser null.
7. Extrae también los votos blancos, nulos y el total de votos.
8. No confundas números escritos a mano, tachaduras o anotaciones con votos.
9. No completes valores mediante suposiciones o cálculos.
10. Si detectas inconsistencias, ilegibilidad o problemas en la fotografía,
    descríbelos en warnings.
11. Los votos deben ser enteros no negativos o null.
12. El resultado debe corresponder únicamente a la dignidad indicada.

La información extraída será revisada por una persona antes de registrarse
definitivamente. Por tanto, prioriza la precisión y señala cualquier duda.
`;

        // 16. Solicitar el reconocimiento a Gemini.
        const geminiUrl = new URL(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        );

        let geminiResponse: Response | null = null;
        const retryableStatuses = [429, 500, 502, 503, 504];

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            geminiResponse = await fetch(geminiUrl.toString(), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey,
              },
              signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: prompt },
                      {
                        inlineData: {
                          mimeType: "image/jpeg",
                          data: imageBase64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  responseMimeType: "application/json",
                  responseJsonSchema: {
                    type: "OBJECT",
                    properties: {
                      candidates: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            candidate_id: { type: "STRING" },
                            votes: { type: "INTEGER", nullable: true },
                            readable: { type: "BOOLEAN" },
                          },
                          required: ["candidate_id", "votes", "readable"],
                        },
                      },
                      blank_votes: { type: "INTEGER", nullable: true },
                      null_votes: { type: "INTEGER", nullable: true },
                      total_votes: { type: "INTEGER", nullable: true },
                      warnings: {
                        type: "ARRAY",
                        items: { type: "STRING" },
                      },
                    },
                    required: [
                      "candidates",
                      "blank_votes",
                      "null_votes",
                      "total_votes",
                      "warnings",
                    ],
                  },
                },
              }),
            });
          } catch (error) {
            if (error instanceof DOMException && error.name === "TimeoutError") {
              return jsonError(
                "El reconocimiento tardó demasiado. Inténtalo nuevamente.",
                504,
              );
            }

            return jsonError(
              "No se pudo contactar el servicio de reconocimiento. Verifica la conexión e inténtalo nuevamente.",
              502,
            );
          }

          if (geminiResponse.ok) {
            break;
          }

          if (
            !retryableStatuses.includes(geminiResponse.status) ||
            attempt === 3
          ) {
            break;
          }

          await geminiResponse.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }

        if (!geminiResponse?.ok) {
          if (geminiResponse?.status === 429) {
            return jsonError(
              "Se alcanzó el límite de solicitudes del reconocimiento. Inténtalo nuevamente más tarde.",
              429,
            );
          }

          if (geminiResponse?.status === 400) {
            return jsonError(
              "Gemini no pudo interpretar la fotografía. Verifica que el acta esté completa y vuelve a intentarlo.",
              422,
            );
          }

          if (
            geminiResponse?.status === 401 ||
            geminiResponse?.status === 403 ||
            geminiResponse?.status === 404
          ) {
            return jsonError(
              "El servicio de reconocimiento no está configurado correctamente.",
              502,
            );
          }

          if (geminiResponse && retryableStatuses.includes(geminiResponse.status)) {
            return jsonError(
              "El servicio de reconocimiento está temporalmente saturado. Inténtalo nuevamente en unos minutos.",
              503,
            );
          }

          return jsonError(
            "Gemini no pudo procesar la fotografía. Verifica la configuración del servicio.",
            502,
          );
        }

        let geminiData: unknown;
        try {
          geminiData = await geminiResponse.json();
        } catch {
          return jsonError(
            "Gemini devolvió una respuesta incompleta. Inténtalo nuevamente.",
            502,
          );
        }

        if (
          !isRecord(geminiData) ||
          !Array.isArray(geminiData.candidates) ||
          !isRecord(geminiData.candidates[0])
        ) {
          return jsonError(
            "Gemini devolvió una respuesta incompleta. Inténtalo nuevamente.",
            502,
          );
        }

        const generatedCandidate = geminiData.candidates[0];
        if (
          !isRecord(generatedCandidate.content) ||
          !Array.isArray(generatedCandidate.content.parts)
        ) {
          return jsonError(
            "Gemini devolvió una respuesta incompleta. Inténtalo nuevamente.",
            502,
          );
        }

        if (generatedCandidate.finishReason !== "STOP") {
          return jsonError(
            "Gemini no pudo completar la lectura de la fotografía. Inténtalo nuevamente.",
            502,
          );
        }

        const generatedText = generatedCandidate.content.parts
          .map((part: unknown) =>
            isRecord(part) && typeof part.text === "string" ? part.text : ""
          )
          .filter((part: string) => part.length > 0)
          .join("\n");

        if (!generatedText) {
          return jsonError(
            "Gemini no devolvió resultados para la fotografía.",
            502,
          );
        }

        // 17. Interpretar y validar el JSON de Gemini.
        let ocrData: OcrResponse;

        try {
          ocrData = parseGeminiJson(generatedText);
        } catch {
          return jsonError(
            "Gemini devolvió datos incompletos o inválidos. Revisa la fotografía e inténtalo nuevamente.",
            502,
          );
        }

        // 18. Relacionar los resultados con los candidatos oficiales.
        const officialIds = new Set(
          officialCandidates.map((candidate) => candidate.id),
        );

        const receivedIds = new Set<string>();
        const receivedResults = new Map<string, OcrCandidate>();

        const warnings = [...ocrData.warnings];

        for (const result of ocrData.candidates) {
          if (!officialIds.has(result.candidate_id)) {
            warnings.push(
              "Gemini devolvió un identificador de candidato no registrado.",
            );
            continue;
          }

          if (receivedIds.has(result.candidate_id)) {
            warnings.push(
              "Gemini devolvió un candidato duplicado. Se requiere revisión.",
            );
            continue;
          }

          receivedIds.add(result.candidate_id);
          receivedResults.set(result.candidate_id, result);
        }

        const formResults = officialCandidates.map((candidate) => {
          const result = receivedResults.get(candidate.id);

          if (!result) {
            warnings.push(
              `No se obtuvo un resultado para ${candidate.name}.`,
            );
          }

          if (result && !result.readable) {
            warnings.push(
              `El valor de ${candidate.name} requiere revisión manual.`,
            );
          }

          return {
            candidate_id: candidate.id,
            candidate_name: candidate.name,
            political_organization: candidate.organization,
            votes: result?.votes ?? null,
            readable: result?.readable ?? false,
          };
        });

        // 19. Comprobar la consistencia aritmética sin modificar los valores.
        const allCandidateVotesReadable = formResults.every(
          (result) => result.votes !== null && result.readable,
        );

        const allTotalsReadable =
          ocrData.blank_votes !== null &&
          ocrData.null_votes !== null &&
          ocrData.total_votes !== null;

        let calculatedTotal: number | null = null;
        let arithmeticValid: boolean | null = null;

        if (allCandidateVotesReadable && allTotalsReadable) {
          calculatedTotal = formResults.reduce(
            (sum, result) => sum + (result.votes ?? 0),
            ocrData.blank_votes! + ocrData.null_votes!,
          );

          if (!Number.isSafeInteger(calculatedTotal)) {
            calculatedTotal = null;
            warnings.push(
              "No se pudo comprobar la suma porque el resultado excede el rango numérico permitido.",
            );
          } else {
            arithmeticValid = calculatedTotal === ocrData.total_votes;

            if (!arithmeticValid) {
              warnings.push(
                "La suma de votos por candidatos, blancos y nulos no coincide con el total del acta.",
              );
            }
          }
        } else {
          warnings.push(
            "No se pudo comprobar completamente la suma porque existen valores ilegibles.",
          );
        }

        // 20. Devolver los datos para rellenar el formulario.
        // No se insertan ni actualizan votos en la base de datos.
        return Response.json({
          success: true,
          act_id: act.id,
          evidence_id: evidence.id,
          position: {
            id: position.id,
            code: position.code,
            name: position.name,
          },
          results: formResults,
          blank_votes: ocrData.blank_votes,
          null_votes: ocrData.null_votes,
          total_votes: ocrData.total_votes,
          calculated_total: calculatedTotal,
          arithmetic_valid: arithmeticValid,
          requires_manual_review: true,
          warnings: [...new Set(warnings)],
        });
      } catch {
        return jsonError(
          "Ocurrió un error inesperado al procesar el acta.",
          500,
        );
      }
    },
  ),
};

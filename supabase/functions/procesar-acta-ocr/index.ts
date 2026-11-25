
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const GEMINI_MODEL = "gemini-2.5-flash";
const STORAGE_BUCKET = "act-evidence";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

interface RequestBody {
  actId: number;
  evidenceId: number;
}

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

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("candidates" in parsed) ||
    !Array.isArray(parsed.candidates)
  ) {
    throw new Error("La respuesta de Gemini no tiene la estructura esperada.");
  }

  const data = parsed as Record<string, unknown>;

  if (
    !isNullableVote(data.blank_votes) ||
    !isNullableVote(data.null_votes) ||
    !isNullableVote(data.total_votes)
  ) {
    throw new Error("Gemini devolvió valores de votos inválidos.");
  }

  const candidates: OcrCandidate[] = [];

  for (const item of data.candidates) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("candidate_id" in item) ||
      !("votes" in item) ||
      !("readable" in item)
    ) {
      throw new Error("Gemini devolvió un candidato con estructura inválida.");
    }

    const candidate = item as Record<string, unknown>;

    if (
      typeof candidate.candidate_id !== "string" ||
      !isNullableVote(candidate.votes) ||
      typeof candidate.readable !== "boolean"
    ) {
      throw new Error("Gemini devolvió datos inválidos para un candidato.");
    }

    candidates.push({
      candidate_id: candidate.candidate_id,
      votes: candidate.readable ? candidate.votes : null,
      readable: candidate.readable,
    });
  }

  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter(
      (warning): warning is string => typeof warning === "string",
    )
    : [];

  return {
    candidates,
    blank_votes: data.blank_votes,
    null_votes: data.null_votes,
    total_votes: data.total_votes,
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
        let body: RequestBody;

        try {
          body = await req.json();
        } catch {
          return jsonError("El cuerpo de la solicitud no es válido.", 400);
        }

        if (
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

          console.log("Diagnóstico del rol:", {
            userId,
            userRole,
            roleError: roleError?.message ?? null,
          }); 

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

        console.log("Diagnóstico de imagen:", {
          storagePath: evidence.storage_path,
          contentType: image.type,
          size: image.size,
          firstBytes: Array.from(imageBytes.slice(0, 12)).map(
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join(" "),
          isJpeg: isJpeg(imageBytes),
        });

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

        geminiUrl.searchParams.set("key", geminiApiKey);

        
      let geminiResponse: Response;

      for (let attempt = 1; attempt <= 3; attempt++) {
        geminiResponse = await fetch(geminiUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
                // CONSERVA AQUÍ EL responseJsonSchema
                // COMPLETO QUE YA TIENES IMPLEMENTADO.
              },
            },
          }),
        });

        if (geminiResponse.ok) {
          break;
        }

        const retryableStatuses = [429, 500, 502, 503, 504];

        if (
          !retryableStatuses.includes(geminiResponse.status) ||
          attempt === 3
        ) {
          break;
        }

        console.warn(
          `Gemini respondió ${geminiResponse.status}. Reintento ${attempt}/3.`,
        );

        await geminiResponse.body?.cancel();

        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * attempt)
        );
      }

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();

        console.error(
          "Error de Gemini:",
          geminiResponse.status,
          errorBody,
        );

      if ([429, 500, 502, 503, 504].includes(geminiResponse.status)) {
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


        const geminiData = await geminiResponse.json();

        const generatedText =
          geminiData?.candidates?.[0]?.content?.parts
            ?.find((part: { text?: string }) =>
              typeof part.text === "string"
            )?.text;

        if (typeof generatedText !== "string") {
          return jsonError(
            "Gemini no devolvió una respuesta de texto válida.",
            502,
          );
        }

        // 17. Interpretar y validar el JSON de Gemini.
        let ocrData: OcrResponse;

        try {
          ocrData = parseGeminiJson(generatedText);
        } catch (error) {
          console.error("Error al interpretar el OCR:", error);

          return jsonError(
            "La respuesta de Gemini no tiene un formato válido.",
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
          calculatedTotal =
            formResults.reduce(
              (sum: number, result) => sum + result.votes!,
              0,
            ) +
            ocrData.blank_votes! +
            ocrData.null_votes!;

          arithmeticValid = calculatedTotal === ocrData.total_votes;

          if (!arithmeticValid) {
            warnings.push(
              "La suma de votos por candidatos, blancos y nulos no coincide con el total del acta.",
            );
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
      } catch (error) {
        console.error("Error inesperado en procesar-acta-ocr:", error);

        return jsonError(
          "Ocurrió un error inesperado al procesar el acta.",
          500,
        );
      }
    },
  ),
};

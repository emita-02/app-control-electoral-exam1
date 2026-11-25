-- F05: registro atómico de actas electorales.
-- No modifica tablas, columnas, relaciones, políticas RLS ni datos existentes.
-- La escritura se concentra en una RPC SECURITY DEFINER porque las tablas
-- `electoral_acts` y `act_results` solo exponen lectura al cliente.

CREATE OR REPLACE FUNCTION public.registrar_acta_electoral(
  p_electoral_table_id bigint,
  p_position_id smallint,
  p_candidate_votes jsonb,
  p_blank_votes integer,
  p_null_votes integer,
  p_total_votes integer,
  p_observation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_position_code text;
  v_official_candidate_count integer;
  v_item jsonb;
  v_candidate_id bigint;
  v_votes integer;
  v_candidate_ids bigint[] := ARRAY[]::bigint[];
  v_candidate_votes integer[] := ARRAY[]::integer[];
  v_candidate_votes_sum bigint := 0;
  v_act_id bigint;
  v_status text;
  v_created_at timestamptz;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión nuevamente para registrar el acta.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_active_user() IS NOT TRUE THEN
    RAISE EXCEPTION 'Tu cuenta no está activa. Contacta al coordinador.'
      USING ERRCODE = '42501';
  END IF;

  IF public.get_my_role() <> 'veedor' THEN
    RAISE EXCEPTION 'Solo un veedor puede registrar actas electorales.'
      USING ERRCODE = '42501';
  END IF;

  IF p_electoral_table_id IS NULL OR p_electoral_table_id <= 0 THEN
    RAISE EXCEPTION 'Selecciona una mesa electoral válida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.electoral_tables et
    WHERE et.id = p_electoral_table_id
  ) THEN
    RAISE EXCEPTION 'La mesa seleccionada no existe.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.watcher_assignments wa
    WHERE wa.watcher_id = v_user_id
      AND wa.electoral_table_id = p_electoral_table_id
      AND wa.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No tienes una asignación vigente en la mesa seleccionada.'
      USING ERRCODE = '42501';
  END IF;

  IF p_position_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una dignidad electoral.'
      USING ERRCODE = '22023';
  END IF;

  SELECT ep.code
  INTO v_position_code
  FROM public.electoral_positions ep
  WHERE ep.id = p_position_id;

  IF v_position_code IS NULL OR v_position_code NOT IN ('alcaldia', 'prefectura') THEN
    RAISE EXCEPTION 'La dignidad seleccionada no es válida para el registro de actas.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.electoral_acts ea
    WHERE ea.electoral_table_id = p_electoral_table_id
      AND ea.position_id = p_position_id
  ) THEN
    RAISE EXCEPTION 'Ya existe un acta registrada para esta mesa y dignidad.'
      USING ERRCODE = '23505';
  END IF;

  IF p_candidate_votes IS NULL OR jsonb_typeof(p_candidate_votes) <> 'array' THEN
    RAISE EXCEPTION 'La lista de votos por candidato no tiene un formato válido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_blank_votes IS NULL OR p_blank_votes < 0
    OR p_null_votes IS NULL OR p_null_votes < 0
    OR p_total_votes IS NULL OR p_total_votes < 0 THEN
    RAISE EXCEPTION 'Los votos deben ser números enteros no negativos.'
      USING ERRCODE = '22023';
  END IF;

  IF p_total_votes::bigint < p_blank_votes::bigint + p_null_votes::bigint THEN
    RAISE EXCEPTION 'El total de votos no puede ser menor que los votos blancos y nulos.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidate_votes)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR NOT (v_item ?& ARRAY['candidate_id', 'votes'])
      OR jsonb_typeof(v_item->'candidate_id') <> 'number'
      OR jsonb_typeof(v_item->'votes') <> 'number'
      OR (v_item->>'candidate_id') !~ '^[0-9]+$'
      OR (v_item->>'votes') !~ '^[0-9]+$'
      OR (v_item->>'candidate_id')::numeric > 9223372036854775807
      OR (v_item->>'votes')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'Cada voto debe indicar una candidatura y un número entero no negativo.'
        USING ERRCODE = '22023';
    END IF;

    v_candidate_id := (v_item->>'candidate_id')::bigint;
    v_votes := (v_item->>'votes')::integer;

    IF v_candidate_ids @> ARRAY[v_candidate_id]::bigint[] THEN
      RAISE EXCEPTION 'Una candidatura aparece repetida en el acta.'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.candidates c
      WHERE c.id = v_candidate_id
        AND c.position_id = p_position_id
    ) THEN
      RAISE EXCEPTION 'Una candidatura del acta no pertenece a la dignidad seleccionada.'
        USING ERRCODE = '22023';
    END IF;

    v_candidate_ids := array_append(v_candidate_ids, v_candidate_id);
    v_candidate_votes := array_append(v_candidate_votes, v_votes);
    v_candidate_votes_sum := v_candidate_votes_sum + v_votes::bigint;
  END LOOP;

  SELECT count(*)::integer
  INTO v_official_candidate_count
  FROM public.candidates c
  WHERE c.position_id = p_position_id;

  IF v_official_candidate_count = 0 THEN
    RAISE EXCEPTION 'No hay candidaturas oficiales configuradas para esta dignidad.'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(v_candidate_ids) <> v_official_candidate_count THEN
    RAISE EXCEPTION 'Debes registrar un valor para cada candidatura oficial de la dignidad.'
      USING ERRCODE = '22023';
  END IF;

  IF p_total_votes::bigint <> v_candidate_votes_sum + p_blank_votes::bigint + p_null_votes::bigint THEN
    RAISE EXCEPTION 'La suma de votos por candidato, blancos y nulos debe coincidir con el total.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.electoral_acts (
    electoral_table_id,
    position_id,
    registered_by,
    total_votes,
    blank_votes,
    null_votes,
    observation
  )
  VALUES (
    p_electoral_table_id,
    p_position_id,
    v_user_id,
    p_total_votes,
    p_blank_votes,
    p_null_votes,
    NULLIF(btrim(p_observation), '')
  )
  RETURNING id, status::text, created_at INTO v_act_id, v_status, v_created_at;

  INSERT INTO public.act_results (
    act_id,
    position_id,
    candidate_id,
    votes
  )
  SELECT
    v_act_id,
    p_position_id,
    result.candidate_id,
    result.votes
  FROM unnest(v_candidate_ids, v_candidate_votes)
    AS result(candidate_id, votes);

  RETURN jsonb_build_object(
    'act_id', v_act_id,
    'electoral_table_id', p_electoral_table_id,
    'position_id', p_position_id,
    'status', v_status,
    'total_votes', p_total_votes,
    'blank_votes', p_blank_votes,
    'null_votes', p_null_votes,
    'observation', NULLIF(btrim(p_observation), ''),
    'registered_by', v_user_id,
    'created_at', v_created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_acta_electoral(
  bigint,
  smallint,
  jsonb,
  integer,
  integer,
  integer,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_acta_electoral(
  bigint,
  smallint,
  jsonb,
  integer,
  integer,
  integer,
  text
) TO authenticated;

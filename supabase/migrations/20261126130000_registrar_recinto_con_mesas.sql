-- F03: creación atómica de un recinto electoral y sus mesas.
-- No modifica tablas, columnas, relaciones, datos ni políticas RLS.
-- PostgREST no permite insertar en dos tablas dentro de una sola transacción
-- desde el cliente; esta RPC SECURITY DEFINER concentra ambas escrituras.
-- Si falla cualquiera, PostgreSQL revierte todo y no queda un recinto parcial.
--
-- Verificación pendiente antes de aplicar: confirmar en el esquema remoto que
-- `polling_places.id`, `polling_places.parish_id` y `electoral_tables.id` son
-- bigint y que `get_my_role()` devuelve 'coordinador_provincial'. Los tipos
-- internos se anclan con %TYPE a las columnas reales; la firma sigue el patrón
-- de `20261125120000_registrar_acta_electoral.sql` para poder REVOKE/GRANT.
--
-- LÍMITE APROBADO: cada recinto admite de 1 a 100 mesas. El techo acota filas,
-- duración del bloqueo y crecimiento del WAL en una sola transacción. La
-- validación se repite en el formulario, el caso de uso, la Edge Function y
-- esta RPC para que ninguna capa pueda eludir el rango.

CREATE OR REPLACE FUNCTION public.registrar_recinto_con_mesas(
  p_parish_id bigint,
  p_name text,
  p_code text,
  p_address text,
  p_table_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_province_id public.profiles.province_id%TYPE;
  v_parish_province_id public.cantons.province_id%TYPE;
  v_polling_place_id public.polling_places.id%TYPE;
  v_code public.polling_places.code%TYPE;
  v_name public.polling_places.name%TYPE;
  v_address public.polling_places.address%TYPE;
  v_mesas jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para registrar un recinto.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_active_user() IS NOT TRUE THEN
    RAISE EXCEPTION 'La cuenta no está activa.'
      USING ERRCODE = '42501';
  END IF;

  -- IS DISTINCT FROM también rechaza un rol NULL: NULL <> valor sería NULL
  -- y no entraría al bloque, dejando pasar la validación.
  IF lower(btrim(public.get_my_role()::text)) IS DISTINCT FROM 'coordinador_provincial' THEN
    RAISE EXCEPTION 'Solo el coordinador provincial puede registrar recintos.'
      USING ERRCODE = '42501';
  END IF;

  SELECT pr.province_id
  INTO v_province_id
  FROM public.profiles pr
  WHERE pr.id = v_user_id
    AND pr.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no tiene una provincia activa asignada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ca.province_id
  INTO v_parish_province_id
  FROM public.parishes pa
  JOIN public.cantons ca ON ca.id = pa.canton_id
  WHERE pa.id = p_parish_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La parroquia seleccionada no existe.'
      USING ERRCODE = '22023';
  END IF;

  IF v_parish_province_id IS DISTINCT FROM v_province_id THEN
    RAISE EXCEPTION 'La parroquia seleccionada no pertenece a tu provincia.'
      USING ERRCODE = '42501';
  END IF;

  IF p_table_count IS NULL OR p_table_count < 1 OR p_table_count > 100 THEN
    RAISE EXCEPTION 'Ingresa una cantidad de mesas de 1 a 100.'
      USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR btrim(p_name::text) = '' THEN
    RAISE EXCEPTION 'Ingresa el nombre del recinto.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.polling_places (parish_id, name, code, address)
  VALUES (
    p_parish_id,
    btrim(p_name::text),
    NULLIF(btrim(p_code::text), ''),
    NULLIF(btrim(p_address::text), '')
  )
  RETURNING id, code, name, address
  INTO v_polling_place_id, v_code, v_name, v_address;

  INSERT INTO public.electoral_tables (polling_place_id, table_number)
  SELECT v_polling_place_id, mesa.numero
  FROM generate_series(1, p_table_count) AS mesa(numero);

  SELECT jsonb_agg(
           jsonb_build_object(
             'id', et.id,
             'table_number', et.table_number
           )
           ORDER BY et.table_number
         )
  INTO v_mesas
  FROM public.electoral_tables et
  WHERE et.polling_place_id = v_polling_place_id;

  -- Contrato compartido con registrar-recinto y SupabaseTerritoryRepository:
  -- { id, code, name, address, electoral_tables: [{ id, table_number }] }
  RETURN jsonb_build_object(
    'id', v_polling_place_id,
    'code', v_code,
    'name', v_name,
    'address', v_address,
    'electoral_tables', COALESCE(v_mesas, '[]'::jsonb)
  );
END;
$function$;

-- SECURITY DEFINER ejecuta la función como su propietario. Se fija `postgres`
-- (rol con el que corren las migraciones y con bypassrls en Supabase) para que
-- las inserciones no dependan de que `authenticated` tenga INSERT directo en
-- polling_places o electoral_tables. No cambia el propietario de las tablas.
ALTER FUNCTION public.registrar_recinto_con_mesas(
  bigint,
  text,
  text,
  text,
  integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_recinto_con_mesas(
  bigint,
  text,
  text,
  text,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_recinto_con_mesas(
  bigint,
  text,
  text,
  text,
  integer
) TO authenticated;

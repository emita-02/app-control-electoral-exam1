-- Propuesta NO aplicada: campos de contacto del personal electoral.
-- RF-02 exige registrar cédula, nombres, teléfono y correo. El esquema actual
-- de `public.profiles` solo dispone de `full_name`; esta migración propone dos
-- columnas opcionales para no afectar filas existentes. No modifica RLS,
-- relaciones, datos ni políticas. Requiere aprobación antes de aplicarse.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_card text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.profiles.id_card IS
  'Cédula de identidad del coordinador de recinto o veedor (RF-02).';
COMMENT ON COLUMN public.profiles.phone IS
  'Teléfono de contacto del coordinador de recinto o veedor (RF-02).';

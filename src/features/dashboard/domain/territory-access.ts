export type TableTerritory = {
  polling_places?: {
    parishes?: {
      cantons?: { province_id: number } | null;
    } | null;
  } | null;
};

/**
 * El panel provincial solo puede ver mesas cuya provincia esté confirmada en
 * los datos cargados. Si falta la relación territorial no se permite el acceso.
 */
export function tableBelongsToProvince(
  table: TableTerritory,
  provinceId: number | null,
): boolean {
  if (provinceId === null) {
    return false;
  }
  const canton = table.polling_places?.parishes?.cantons ?? null;
  return canton !== null && canton.province_id === provinceId;
}

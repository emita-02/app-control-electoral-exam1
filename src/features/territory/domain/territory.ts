export type ElectoralTable = {
  id: number;
  tableNumber: number;
};

export type PollingPlace = {
  id: number;
  code: string | null;
  name: string;
  address: string | null;
  electoralTables: ElectoralTable[];
};

export type Parish = {
  id: number;
  code: string | null;
  name: string;
  type: string;
  pollingPlaces: PollingPlace[];
};

export type Canton = {
  id: number;
  code: string | null;
  name: string;
  parishes: Parish[];
};

export type ProvinceTerritory = {
  id: number;
  name: string;
  cantons: Canton[];
};

export type CreatePollingPlaceInput = {
  parishId: number;
  code: string | null;
  name: string;
  address: string | null;
  tableCount: number;
};

export interface ProvinceTerritoryRepository {
  findByProvinceId(provinceId: number): Promise<ProvinceTerritory>;
  createPollingPlace(input: CreatePollingPlaceInput): Promise<PollingPlace>;
}

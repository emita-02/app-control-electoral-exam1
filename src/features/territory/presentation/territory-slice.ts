import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { createPollingPlace as createPollingPlaceUseCase } from '@/features/territory/application/create-polling-place';
import { getProvinceTerritory } from '@/features/territory/application/get-province-territory';
import type {
  CreatePollingPlaceInput,
  PollingPlace,
  ProvinceTerritory,
  ProvinceTerritoryRepository,
} from '@/features/territory/domain/territory';

type TerritoryDependencies = {
  territoryRepository: ProvinceTerritoryRepository;
};

type TerritoryState = {
  province: ProvinceTerritory | null;
  requestId: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  createRequestId: string | null;
  createStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  createError: string | null;
};

const initialState: TerritoryState = {
  province: null,
  requestId: null,
  status: 'idle',
  error: null,
  createRequestId: null,
  createStatus: 'idle',
  createError: null,
};

export const fetchProvinceTerritory = createAsyncThunk<
  ProvinceTerritory,
  number,
  { extra: TerritoryDependencies }
>(
  'territory/fetchProvinceTerritory',
  async (provinceId, { extra }) =>
    getProvinceTerritory(extra.territoryRepository, provinceId),
);

export const registerPollingPlace = createAsyncThunk<
  PollingPlace,
  CreatePollingPlaceInput,
  { extra: TerritoryDependencies }
>(
  'territory/registerPollingPlace',
  async (input, { extra }) =>
    createPollingPlaceUseCase(extra.territoryRepository, input),
);

const territorySlice = createSlice({
  name: 'territory',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProvinceTerritory.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProvinceTerritory.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) {
          return;
        }
        state.province = action.payload;
        state.requestId = null;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(fetchProvinceTerritory.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) {
          return;
        }
        state.requestId = null;
        state.status = 'failed';
        state.error = action.error.message ?? 'No se pudo cargar la estructura territorial.';
      })
      .addCase(registerPollingPlace.pending, (state, action) => {
        state.createRequestId = action.meta.requestId;
        state.createStatus = 'loading';
        state.createError = null;
      })
      .addCase(registerPollingPlace.fulfilled, (state, action) => {
        if (state.createRequestId !== action.meta.requestId) {
          return;
        }

        const parish = state.province?.cantons
          .flatMap((canton) => canton.parishes)
          .find((item) => item.id === action.meta.arg.parishId);
        parish?.pollingPlaces.push(action.payload);
        state.createRequestId = null;
        state.createStatus = 'succeeded';
        state.createError = null;
      })
      .addCase(registerPollingPlace.rejected, (state, action) => {
        if (state.createRequestId !== action.meta.requestId) {
          return;
        }

        state.createRequestId = null;
        state.createStatus = 'failed';
        state.createError =
          action.error.message ?? 'No se pudo registrar el recinto.';
      });
  },
});

export default territorySlice.reducer;

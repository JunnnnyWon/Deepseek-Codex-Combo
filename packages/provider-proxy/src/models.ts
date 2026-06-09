export type ProviderModel = {
  readonly id: string;
  readonly object: "model";
  readonly owned_by: "deepseek";
};

export type ModelListProvider = () => Promise<readonly ProviderModel[]> | readonly ProviderModel[];

export type ModelListResponse = {
  readonly data: readonly ProviderModel[];
  readonly object: "list";
  readonly source: "local" | "upstream";
};

export type ModelListCache = {
  readonly getModels: (provider?: ModelListProvider) => Promise<ModelListResponse>;
};

export type ModelListCacheOptions = {
  readonly ttlMs?: number;
};

export const localModelCatalog = [
  { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
  { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
] as const satisfies readonly ProviderModel[];

export const createModelListCache = (options: ModelListCacheOptions = {}): ModelListCache => {
  const ttlMs = options.ttlMs ?? 60_000;
  let cachedAt = 0;
  let cachedModels: readonly ProviderModel[] | undefined;

  const getModels = async (provider?: ModelListProvider): Promise<ModelListResponse> => {
    const now = Date.now();
    if (cachedModels !== undefined && now - cachedAt < ttlMs) {
      return { data: cachedModels, object: "list", source: "upstream" };
    }

    if (provider === undefined) {
      return { data: localModelCatalog, object: "list", source: "local" };
    }

    try {
      const models = await provider();
      cachedModels = models;
      cachedAt = now;
      return { data: models, object: "list", source: "upstream" };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return { data: localModelCatalog, object: "list", source: "local" };
    }
  };

  return { getModels };
};

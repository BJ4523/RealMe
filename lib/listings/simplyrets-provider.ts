import {
  normalizeDraft,
  type FetchListingsOptions,
  type FetchOneRef,
  type ListingDraft,
  type ListingPhoto,
  type ListingProvider,
} from "./provider";

/**
 * SimplyRETS aggregator. SimplyRETS normalizes any MLS RETS/RESO feed behind a
 * single REST API; the agent brings their own MLS credentials (Basic auth).
 * Agent-level filtering uses the listing-agent id (`?agent=`), which maps to the
 * RESO ListAgentMlsId stored on the profile.
 *
 * Testable today with the public demo account: username `simplyrets`,
 * password `simplyrets` (a fixed sample dataset; filter by any demo agent id
 * such as `sphelps`).
 */
const BASE = "https://api.simplyrets.com";

interface SimplyRetsCredentials {
  username?: string;
  password?: string;
}

export const simplyRetsProvider: ListingProvider = {
  id: "simplyrets",
  requiresConnection: true,

  async fetchListings(opts: FetchListingsOptions): Promise<ListingDraft[]> {
    const params = new URLSearchParams({ limit: "50", status: "Active" });
    if (opts.agentMlsId) params.set("agent", opts.agentMlsId);

    const properties = await simplyRetsFetch<SimplyRetsProperty[]>(
      `/properties?${params.toString()}`,
      opts.credentials,
    );
    return properties.map(mapProperty);
  },

  async fetchOne(ref: FetchOneRef): Promise<ListingDraft | null> {
    if (!ref.externalId) return null;
    const property = await simplyRetsFetch<SimplyRetsProperty>(
      `/properties/${encodeURIComponent(ref.externalId)}`,
      ref.credentials,
    );
    return property ? mapProperty(property) : null;
  },

  normalize(input: Partial<ListingDraft>) {
    return normalizeDraft(input);
  },
};

async function simplyRetsFetch<T>(
  path: string,
  credentials: Record<string, unknown> | undefined,
): Promise<T> {
  const { username, password } = (credentials ?? {}) as SimplyRetsCredentials;
  if (!username || !password) {
    throw new Error("SimplyRETS credentials are missing. Reconnect the MLS.");
  }
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SimplyRETS ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- SimplyRETS → ListingDraft mapping -------------------------------------

interface SimplyRetsProperty {
  mlsId?: number;
  listPrice?: number;
  remarks?: string;
  photos?: string[];
  address?: {
    full?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  property?: {
    bedrooms?: number;
    bathsFull?: number;
    area?: number;
    lotSize?: string;
    yearBuilt?: number;
    type?: string;
    subTypeText?: string;
    style?: string;
    interiorFeatures?: string;
    exteriorFeatures?: string;
  };
}

function mapProperty(p: SimplyRetsProperty): ListingDraft {
  const a = p.address ?? {};
  const prop = p.property ?? {};
  const photos: ListingPhoto[] = (p.photos ?? []).map((url, order) => ({
    url,
    order,
  }));

  const features = [prop.interiorFeatures, prop.exteriorFeatures]
    .filter(Boolean)
    .flatMap((s) => String(s).split(","))
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 12);

  return normalizeDraft({
    address: a.full,
    city: a.city,
    state: a.state,
    zip: a.postalCode,
    price: p.listPrice,
    beds: prop.bedrooms,
    baths: prop.bathsFull,
    sqft: prop.area,
    lotSize: prop.lotSize,
    yearBuilt: prop.yearBuilt,
    propertyType: prop.subTypeText || prop.type || prop.style,
    description: p.remarks,
    features,
    photos,
    externalId: p.mlsId != null ? String(p.mlsId) : undefined,
  });
}

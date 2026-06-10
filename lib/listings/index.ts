import { manualProvider } from "./manual-provider";
import { urlScrapeProvider } from "./url-scrape-provider";
import type { ListingProvider, ProviderId } from "./provider";

const PROVIDERS: Record<string, ListingProvider> = {
  manual: manualProvider,
  url_scrape: urlScrapeProvider,
};

export function getListingProvider(id: ProviderId | string): ListingProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown or unsupported listing provider: ${id}`);
  }
  return provider;
}

export type { ListingProvider, ListingDraft, ProviderId } from "./provider";

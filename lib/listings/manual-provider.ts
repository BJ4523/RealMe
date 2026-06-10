import {
  normalizeDraft,
  type ListingDraft,
  type ListingProvider,
} from "./provider";

/** Manual entry — the agent types listing details into a form. */
export const manualProvider: ListingProvider = {
  id: "manual",
  async fetchListings() {
    return [];
  },
  async fetchOne() {
    return null;
  },
  normalize(input: Partial<ListingDraft>) {
    return normalizeDraft(input);
  },
};

import {
  normalizeDraft,
  type ListingDraft,
  type ListingProvider,
} from "./provider";

/**
 * SimplyRETS aggregator — STUB. Implements the interface so it can be swapped
 * in later without UI changes. SimplyRETS normalizes any MLS RETS/RESO feed;
 * the agent brings their own MLS credentials. Agent-level filtering uses the
 * RESO ListAgentMlsId field (opts.agentMlsId).
 *
 * Production wiring (when ready): GET https://api.simplyrets.com/properties
 * with Basic auth from the saved connection, map fields to ListingDraft.
 */
export const simplyRetsProvider: ListingProvider = {
  id: "simplyrets",
  requiresConnection: true,

  async fetchListings(): Promise<ListingDraft[]> {
    throw new Error(
      "SimplyRETS integration is not yet enabled. Add listings manually or via URL for now.",
    );
  },

  async fetchOne(): Promise<ListingDraft | null> {
    throw new Error("SimplyRETS integration is not yet enabled.");
  },

  normalize(input: Partial<ListingDraft>) {
    return normalizeDraft(input);
  },
};

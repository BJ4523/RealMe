// @ts-nocheck
/* eslint-disable */
"use client";
import { createContext, useContext } from "react";
import { LISTINGS } from "@/components/site/shared";

/**
 * Provides the signed-in agent's real listings to the dashboard subtree.
 * Falls back to the design's demo listings when the account has none, so the
 * dashboard never looks empty in a demo.
 */
const DashboardDataContext = createContext({
  listings: LISTINGS,
  isReal: false,
  hasAvatar: false,
});

export function DashboardDataProvider({ listings, hasAvatar, children }) {
  const hasReal = Array.isArray(listings) && listings.length > 0;
  const value = {
    listings: hasReal ? listings : LISTINGS,
    isReal: hasReal,
    hasAvatar: !!hasAvatar,
  };
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  return useContext(DashboardDataContext);
}

// BUILD.md §11, verbatim. "Check entitlements server-side, in the data
// layer, not in the UI. A hidden button is not access control."
export const PLANS = {
  free: { entitlements: ["tools.basic", "trips.3"] },
  plus: { entitlements: ["tools.all", "trips.unlimited", "ads.off", "alerts.25"] },
  claim: { entitlements: ["listing.manage", "enquiries.inbox", "stats.basic"] },
  pro: { entitlements: ["benchmark.12m", "forecast.8w", "comps.5", "export.csv"] },
  portfolio: {
    entitlements: [
      "benchmark.36m",
      "forecast.26w",
      "comps.25",
      "api.basic",
      "properties.10",
      "markets.5",
      "seats.5",
    ],
  },
  analyst: { entitlements: ["screener", "yield.models", "reg.alerts.10", "reports.all"] },
  firm: {
    entitlements: ["screener", "yield.models", "reg.alerts.unlimited", "api.10k", "seats.5", "export.25k"],
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Regulatory answers, entry requirements and health information are free at
// every tier, always (BUILD.md §11, "never gate accuracy or safety"). This
// list exists so a future PR can't quietly gate one behind an entitlement.
export const NEVER_GATED = ["rules.visa", "rules.entry", "rules.health"] as const;

export interface AccountLike {
  entitlements: readonly string[];
}

export function can(account: AccountLike, entitlement: string): boolean {
  if ((NEVER_GATED as readonly string[]).includes(entitlement)) return true;
  return account.entitlements.includes(entitlement);
}

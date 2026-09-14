// BUILD.md §7.1, verbatim structure -- the reference example every other
// template should be modelled on.
import { defineTemplate } from "../define";

export default defineTemplate({
  id: "destination",
  entityType: "place",
  entityFilter: { type: ["city", "district"] },
  urlPattern: "/places/{country}/{region}/{slug}",

  requiredFields: [
    "place.centroid",
    "place.timezone",
    "signal.climate_monthly", // >= 12 observations
    "signal.price_band", // >= 20 observations
    "property.count", // >= 5 properties
  ],
  minObservations: { "signal.price_band": 20, "signal.climate_monthly": 12 },
  maxAgeDays: { "signal.price_band": 45, "rule.*": 30 },
  minCompleteness: 0.72,

  requiresUniqueData: ["signal.price_band", "property.count"],
  maxSiblingSimilarity: 0.7,

  blocks: ["answer", "evidence", "interpretation", "practical", "tool", "sources", "related"],
  maxProseWordShare: 0.4,
  reviewSampleRate: 0.05,
});

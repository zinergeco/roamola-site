# Route map (BUILD.md §5 / master plan §5, reconciled)

Not yet built — placeholder so the routing decisions are recorded next to
the app that has to implement them, per the "facet slugs are a closed
enum, never open parameter space" rule.

```
app/
├── (marketing)/
│   ├── page.tsx                                  /
│   ├── methodology/page.tsx                      /methodology
│   ├── sources/page.tsx                          /sources
│   └── corrections/page.tsx                      /corrections
├── places/
│   ├── [country]/page.tsx                        /places/portugal
│   ├── [country]/[region]/page.tsx
│   ├── [country]/[region]/[city]/page.tsx
│   └── [country]/[region]/[city]/[facet]/page.tsx   <- [facet] validates
│                                                       against a whitelist;
│                                                       anything else 404s,
│                                                       never a generated
│                                                       page (BUILD.md §5)
├── stays/[category]/[place]/page.tsx
├── experiences/[theme]/[place]/page.tsx
├── routes/[pair]/page.tsx                         /routes/manchester-to-faro
├── rules/[topic]/[subject]/[counterpart]/page.tsx /rules/visa/uk/vietnam
├── tools/{page.tsx, [tool]/page.tsx}
├── journal/[slug]/page.tsx
├── insights/[market]/page.tsx
├── assets/[market]/page.tsx                       # FLAG_ASSETS_MODULE gated
├── store/[product]/page.tsx                       # FLAG_STORE_ENABLED gated
├── business/{layout.tsx, listings/, benchmarks/, enquiries/}
├── invest/
├── api/{v1/, tools/[tool]/route.ts, events/route.ts, webhooks/stripe/route.ts}
├── sitemap-[segment].xml/route.ts                 # one per template, never one big file
└── robots.txt/route.ts
```

Build order for this tree follows BUILD.md §15: destination-page UI is M3,
tool shell is M4, portal shells are M6. Admin (review queue, kill switch)
comes earlier than any of this — see `apps/admin`.

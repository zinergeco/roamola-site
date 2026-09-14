# Component library — build order

Per the UI plan's handoff notes: build these nine primitives before any
individual screen, since every wireframe in `roamola-ui-plan.html` reuses
them. Not implemented yet (M1 is schema + generation gates); listed here so
the first real UI work in M3 starts from this list, not a blank page.

1. Data table — real `<th>`, real `<caption>`, sortable, sticky header.
2. Evidence chart — line/bar/box-plot/calendar-heatmap, one component,
   each variant carrying a source citation + confidence note in its own
   footer slot, never optional.
3. Entitlement gate — wraps a block; renders children, a teaser+upgrade
   CTA, or nothing, from a single `can()` check (`@roamola/core`).
4. Provenance chip — figure + date + linked source name.
5. Not-available state — literal italic "Not available" text. Never 0,
   never a dash, never a blank cell.
6. Status badge — maps 1:1 to `page_status` / `entity_claim.status` enum
   values. A new status value needs a new badge variant, not a colour
   override.
7. Confirm-with-consequence dialog — states the concrete, counted impact
   before the destructive action enables (kill switch, source deactivation).
8. Rubric checklist — ties boolean checks to enabling a primary action
   (review queue).
9. Tool shell — ask → compute server-side → shareable result → save gate.

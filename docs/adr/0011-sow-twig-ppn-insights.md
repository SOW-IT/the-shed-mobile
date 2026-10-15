# SOW Insights for TWIGs and PPNs: leaders counted, computed live, defined by the server

SOW's own programmes had no Insights. TWIG (almost weekly, for campus
leaders) and the monthly PPN night only showed up as SOW events inside the
Campuses view's three numbers. After 2.8.0 every SOW monthly PPN carries both
TWIG and PPN, and every TWIG carries TWIG, so tags can tell them apart.

## Decision

- **Tags decide.** TWIG = the Other-events TWIG tag without PPN; PPN = TWIG
  and PPN. A campus PPN (PPN alone) is not counted.
- **TWIG counts campus leaders only.** Staff without a university role run
  TWIG; counting them would hide whether leaders come. They're listed as
  organisers. Anyone with no staff profile that staff year is flagged, since a
  TWIG is for leaders.
- **PPN counts everyone.** It's open to non-leaders; they're noted, not
  flagged.
- **Staff years**, not terms or calendar years, because TWIG and PPN follow
  the staff calendar (ADR 0003).
- **Computed live in one query** (`sowInsights.view`), no snapshot table or
  cron, because the data is small. That also means no rollover work.
- **The server defines the switcher** (`sowInsights.tabs`) as well as the
  blocks, so tabs, labels, rules and wording change with a Convex deploy.
  Only a new block type needs an app release.

## Consequences

- Someone is a campus leader for a staff year only if that year's profile
  says so; a leader whose profile is missing is flagged until Admin fixes it.
- A leader with university roles at two campuses counts under the first.
- If TWIG/PPN history grows by an order of magnitude, the query needs the
  precompute pattern from ADR 0008.

# Existing JRL maths vs admin-dashboard PR 1

PR 1 (`cursor/toki-internal-forecast-8ae0`) has a parallel library under `lib/jrl/` (`finance.js`, `targets.js`, `afford.js`, `months.js`, `sora.js`, `reader.js`). Those files are a rewrite from the written contract. They are not copies of `jack-toki/jrl-finance` at `1f7b5fe0c12ae97b9975982ad12585a2952d3487`. This repo has no tests. PR 1’s `test/jrl.test.js` exercises the rewrite, not these modules.

Use the files in `code/`. Where the two disagree, the JRL column is the one already in production logic.

| Behaviour | This repo | PR 1 `lib/jrl` |
|---|---|---|
| Ledger derivation | `monthly_finance` view, `security_invoker`, window over flows (`supabase/migrations/0001_init.sql`) | `deriveLedger` in JS over in-memory rows |
| Period key | `YYYY-MM-01` | `monthWindow` emits `YYYY-MM` |
| Five fields and overwrite | `EntryForm` order; `saveMonth` upsert on `period` | `ENTRY_FIELDS` and `upsertEntry` match the idea |
| Contributions vs market value | `net_total = savings + tax + hl_contributed`. Gain only when that month supplied a value | Same split (`net` excludes gain; `gain` null when carried) |
| Carried ISA | View carries the last real reading. Earnings null unless this month supplied a value. Earnings subtract contributions since the previous real reading | Carry flag and gap subtraction match after the first reading |
| First real ISA reading | View earnings are null (`lag` of the reading is null). `lib/data.ts` then keeps that null | `deriveLedger` sets earned to value minus all contributions so far |
| “Earned this month” in TS | `lib/finance.ts` `performance()` is a one-month delta. `getDashboard` replaces it with `hl_earnings_this_month` from the view | No view. The JS loop is the only figure |
| Annualised return | Money-weighted IRR (`annualisedIRR`), then verdict against 0.07. Caveat under 12 months | `annualised()` is a simple multiple of gain over contributions, raised to `12 / months`. Not IRR |
| 7% projection | `projection()` on the latest value, years 5…50 step 5, no new money | `projectionRows` matches that shape. Returns null when value is null; the app passes the view’s carried value through |
| Settings rows | `benchmark_rate` and `chase_interest_rate` are stored and unused. Code constant 0.07 is what the UI uses | `verdict` records those settings as ignored. Same intent |
| Target rate | Effective monthly: `(1 + annual) ** (1/12) - 1` | Nominal: `annual / 12` |
| Target formula | `monthsToTarget` / `monthlyForTarget` share one compound equation. Monthly need is clamped at 0. Unreachable past 1200 months is null | Same algebra only if the monthly rate matches. Need is not clamped at 0. No 1200-month cap. Path starts at month 1 and omits the month-0 point |
| Default new-target rates | 4.5% savings, Chase, tax; 0 net and HargLans | `DEFAULT_RATES` matches |
| Scope | Spending page sums `monthly_plan` where `scope = personal` only | `personalMonthlyPlan` filters `scope === 'personal'` |
| Savings floor and adviser | `lib/afford.ts`: commitment is `max(savingsFirst amount, personal target plans)` minus what is already saved this month. Floor headroom is pot minus floor. A want is refused until that saving is in. Needs may use savings above the floor. Wants that would use savings become “split it”. “Pay for it twice”, opportunity cost at 7% over 10 years, target setback, want-share of budget, and a cool-off flag all feed `decide` | `advise` treats `savingsFirst` as a boolean, compares budget remainder to the personal plan, and maps a want that fails “twice” straight to `sleep-on-it`. It does not take `savedThisMonth`, want-spend, or a target name. Same words, different answers |
| Sora list | `lib/sora.ts` plus the page query, page size 30, cursor on `started_at` | `sora.js` filters and pages the same way. Delete confirm is a new boolean gate; this app confirms in the component then calls `deleteConversation` |
| Data load | Anon key plus the user’s Supabase session (`lib/supabase/server.ts`, `proxy.ts`). Service role only inside the two edge functions | `reader.js` also refuses the service role and returns no balances without a user access token. It does not call `getDashboard` |

Nothing here was applied to PR 1.

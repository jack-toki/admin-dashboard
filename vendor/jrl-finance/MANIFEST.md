# JRL source handoff

Read-only export. No repo edits, commits, deploys, database calls, or live account reads.

| | |
|---|---|
| Repo | `jack-toki/jrl-finance` |
| Branch | `main` |
| Commit | `1f7b5fe0c12ae97b9975982ad12585a2952d3487` |
| Tests in that commit | none (`*.test.*`, `*.spec.*`, `test/`, `__tests__/` absent) |
| Files in this packet | 49 source files, listed below |
| Ledger rows | none copied |
| Secret values | none copied |

Port these files. Do not re-type the maths from the prose contract. The validated ledger maths is the SQL view in `supabase/migrations/0001_init.sql`. `lib/finance.ts` is the shared IRR, projection, and currency formatting. `lib/data.ts` overwrites the TypeScript “earned this month” figure with the view’s gap-aware column. `lib/targets.ts` and `lib/afford.ts` are the target solver and the spending adviser.

## Semantics this tree already implements

- Five fields, fixed order, in `components/EntryForm.tsx`: Tax saved, Savings added, HargLans ISA, Withdrawn from savings, HargLans ISA value. Blank flows become 0. A blank ISA value is null, not zero.
- Headline HargLans figure is contributions (`hl_contributed`). Market value is separate. Net total is Chase plus contributions. Chase is savings plus tax.
- A missing ISA reading is carried forward for the chart only. Gain and earnings stay null until a real reading. The next real reading’s earnings subtract contributions since the previous real reading.
- Saving a month upserts `monthly_entry` on `period` (`app/actions.ts`, `onConflict: "period"`).
- Projection is today’s value at 7% (`BENCHMARK_RATE = 0.07`) for 5, 10, 15 … 50 years, with no future contributions (`lib/finance.ts`).
- Emergency floor is hard inside `lib/afford.ts`. Future income is not an input. `app/spending/page.tsx` sums `monthly_plan` only for `finance_target.scope = personal`. Business targets, including tax, stay out of that commitment.
- New-target default annual rates in `components/NewTarget.tsx`: savings, Chase, and tax 4.5%; net and HargLans 0. The solver converts an annual rate with `(1 + annual) ** (1/12) - 1`, not `annual / 12`.

## Dependencies

From `package.json` at this commit. No lockfile in the packet.

Runtime:

- `next` `^16.3.6`
- `react` `^19.0.0`
- `react-dom` `^19.0.0`
- `chart.js` `^4.4.1` (client, `components/GrowthChart.tsx` only)
- `@supabase/supabase-js` `^2.45.0`
- `@supabase/ssr` `^0.5.1`

Dev: `@types/node` `^20`, `@types/react` `^19`, `@types/react-dom` `^19`, `typescript` `^5`.

Path alias `@/*` → repo root (`tsconfig.json`).

Env names the app reads, values not included: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Edge functions read `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ASSISTANT_API_KEY`, `LARGE_AMOUNT_THRESHOLD`, `ALERT_INGEST_KEY`, `SORA_ALERTS_KEY` via `Deno.env.get`. No assignments of those secrets are in the tree.

## Import map

Calculation and adapter:

- `lib/finance.ts` — no local imports. Exports `BENCHMARK_RATE`, `PROJECTION_YEARS`, `gbp`, `signed`, `annualisedIRR`, `performance`, `projection`.
- `lib/targets.ts` — no local imports. Exports `monthlyRate`, `monthsToTarget`, `monthlyForTarget`, `projectPath`, `humanMonths`, `targetDate`, `monthsUntil`.
- `lib/afford.ts` — no local imports. Exports `afford`, `GROWTH_RATE` 0.07, `HORIZON_YEARS` 10.
- `lib/data.ts` — `lib/supabase/server`, `lib/finance`. Exports `getDashboard`, `getEntryContext`.
- `lib/sora.ts` — no local imports. Parse and group only.
- `lib/supabase/server.ts` — `@supabase/ssr`, `next/headers`.
- `lib/supabase/client.ts` — `@supabase/ssr`.

Writes:

- `app/actions.ts` — `saveMonth`, `signOut`. Used by `EntryForm`, `SignOut`.
- `app/targets/actions.ts` — `saveTarget`, `deleteTarget`. Used by `TargetPlanner`, `NewTarget`.
- `app/spending/actions.ts` — `logPurchase`, `deletePurchase`, `removePurchase`, `saveSpendSettings`. Types from `lib/afford`.
- `app/sora/actions.ts` — `deleteConversation`.

Views:

- `app/page.tsx` — data, finance formatting, Allocation, GrowthChart, TargetStrip, Nudge, Sidebar, ThemeToggle, SignOut.
- `app/month/page.tsx` — data, finance formatting, EntryForm, Nudge, Sidebar, ThemeToggle, SignOut.
- `app/targets/page.tsx` — data, TargetPlanner, NewTarget, Sidebar, ThemeToggle, SignOut.
- `app/spending/page.tsx` — data, AffordPanel, SpendSettings, PurchaseList, Sidebar, ThemeToggle, SignOut.
- `app/sora/page.tsx` — sora parse, SoraConversations, Sidebar, ThemeToggle, SignOut.
- `app/login/page.tsx` — browser Supabase client. Password sign-in. No signup.
- `proxy.ts` — session refresh. Public prefixes `/login` and `/auth`.

`components/SoraConversations.tsx` also calls the browser client for “load more”.

## Omitted on purpose

| Path | Why |
|---|---|
| `.env`, `.env.local` | Not read. Not in the packet. |
| `.env.example` | Env file. Placeholders only. Names are listed above; the file itself was not copied. |
| `package-lock.json` | Install pin, not logic. Still at this commit in the repo. |
| `README.md` | Stale (magic link, three pages). Code in this packet wins. |
| `next-env.d.ts` | Generated. Points at `.next`. |
| `node_modules/`, `.next/`, `.git/` | Not source. |
| Any ledger, conversation, or purchase row | Not in git. Not fetched. |

No hardcoded personal balances or integration secrets were found in the copied files. Product constants that did ship, and should stay: benchmark `0.07`, Chase setting seed `4.50` in `0001_init.sql` (the UI does not read that row), new-target default rates, and the form placeholder `50000` in `NewTarget.tsx` (hint text, not a stored balance). The owner-email snippet in `0002_auth.sql` is a comment using `you@example.com` and is not applied.

## Files and sha256

```
58c6286757308709cfcfe3133f093101e25f6ed0d9f01b93d3aba010a5ce77ab  app/actions.ts
c8f00b0c1528c0dbe883ea010b67a6c6ad0071dfd386fa7f55ac7163881f4588  app/globals.css
091bce0ba05ed9a2d07ca766a05558632593c07b385d5e6ae8f921e1da231906  app/layout.tsx
469d909a1fb6049c8a3b9ebf9647af9d0a94c64779cf476cc325366b1d262b60  app/login/page.tsx
f3b3dc2e93802945ea5e5c343b3b73e798f36a975bd145e2b8ca4a422e64d006  app/month/page.tsx
0b13c78c8e035833bc9b470057417beead47e73d5336e1b09d3ce07c2fe60a08  app/page.tsx
fda64a16dfa49d8835192bdfabb962ec459987ba26cde328a2e4c8818a64f05a  app/sora/actions.ts
27a2e758020b92f331d0d2e80dfe64866ce49dbfec8fdfc0533c492febba921d  app/sora/page.tsx
82ba0094dcc98d56b43f353e59f50771abff49b861fb94a03f133fa1f6c42629  app/spending/actions.ts
10f22f0034bf066c5d89e4c5568baa3e9adcaadbdd95ad0339713214e79fbc9b  app/spending/page.tsx
68c0bf2443103f9a9f59fd6f599322ffe7c392dfea5ba0bd13528dd4cd690b89  app/targets/actions.ts
93b9711335533203608c22bd99b6b668ddbd68678c8de6dd39959329c0cf1711  app/targets/page.tsx
6ae16a6de0819b773bd3eb4167bf01f0e76d5d8c3c0b45b8bc15fd1831e59615  components/AffordPanel.tsx
f0f60d4943ec9f703d29aa3db45a2713a495d1d65403e979eb27e608729312fe  components/Allocation.tsx
847afc413ffc9a2f466aa3fe9387eb744f57f15ce2934fcf8478063549a73d8b  components/EntryForm.tsx
9410fbbc7734807ebb0af9a4ccfb506d3cdb07b6727f75e8a1e71f335a2b92d0  components/GrowthChart.tsx
ce653501958e0ed0e4ea466ced99ce565a06021152c3579c461ab7ef0ce70377  components/NewTarget.tsx
c929535f27337d6ba91096ad044bf0afcd77e5031bceafde631a4e735c494a08  components/Nudge.tsx
bbcdefde9d011a18804f25ec9831d493296c8f6758fccc07327322d9304d80c3  components/PurchaseList.tsx
ce70a728d4f2dbd97d727df1da93a27a6d71971cbd10af21650c44faed053fae  components/Sidebar.tsx
82dae5bf4b884cd5413e0dd743c72e2c4ca1d21164763376079161b2d26f079a  components/SignOut.tsx
a320a46d7dddc92a063f029a69ad03777790201437edd34e11e444fc81a4f43f  components/SoraConversations.tsx
9ac2b00ca504452fb32c9aea228d08cbee0f301fb864b3a185af96a7f2a4a106  components/SpendSettings.tsx
2cce0361b7525dcef4bc375db2f530aa81e670bbbc8e8422bf3fd97bc6af8383  components/TargetPlanner.tsx
63597bf3060257537d63cadd568713a461bf461349bd7cbe1098c2780c3ba48e  components/TargetStrip.tsx
f681d19317c28952a5c63eff5cec1370e56b22791dcc2c375141403771f0d884  components/ThemeToggle.tsx
fa19336721abe71c54b496db1e9c00c780f6569c3008483f7124a37c9401713f  lib/afford.ts
50925497bce48ac053d23a1b72e83b28f6a518b108aa995cd61955b11dfb73ec  lib/data.ts
43baa7f14cfa6403670d5a9cddd70644bb17eb767cc7565c43f706c5ba03170f  lib/finance.ts
09d8722f046a7194fb7e981eae9939b2517101e30c8a8eca53b687d61985aff4  lib/sora.ts
ada26825d570119f73771251645c5fef7b1e8f3709baf5083040925b9b3c6e71  lib/supabase/client.ts
4472e600c132ad6e5fa28a8ce96a08f2985b79b72d271e850a39bbcdf91b08ee  lib/supabase/server.ts
7da5df295afb5c270e1b03a5b35dbb4fcacc55f1812b46f94aba51d7459249ad  lib/targets.ts
5097802a9a2d0dbf03522f9d387bb854c053cdb0d5a316051c85127707eca4aa  next.config.mjs
20b157921cc6bd376ce9be53ad4b568fdf2636e355f4f403cc424ccdd4e6a40c  package.json
412f21e354327b8003706a94c3941f8de9eaf72a4578dac782aedf16ac8d6c9e  proxy.ts
e2c05e460bea6e7eadc87646b99e83e1615382f666551d843990724090874fed  supabase/functions/alerts/index.ts
aeaa45728b1e68f0dd1f8ab444b5fcc132c0b15d1f1ce59f8ffd8ddaabb2566d  supabase/functions/transactions/index.ts
6c527b74fc541251d86252b57812ca79768b66ff24189da665b973de6da73165  supabase/migrations/0001_init.sql
520199090de42a06d32cf0bc6ad63ec9c83a49acffb9ba4dd07c94820402e372  supabase/migrations/0002_auth.sql
571a673e2acc2274f7ab33ecd0e79d477e4bc06b1ac49a3b5b48c3c08836c295  supabase/migrations/0003_targets.sql
49063e7a2d7f213aebc8eaa803480bee0f01079735f9e3962ef3cf02b37515f7  supabase/migrations/0004_spending.sql
aa7a04647d9d49362a4c20f20d15b64f16e80fc7921e77ad218c36f4c4431c71  supabase/migrations/0005_target_scope.sql
afc57718428cb40da31c0dd06521f02c240a30d00d86dee72e333e193d7df887  supabase/migrations/20260925192534_purchase_add_sora_columns.sql
ae71f9eeb0f55f1defb425a1473688dbfef7b81526484e81c8bcd3d171c86940  supabase/migrations/20260925193343_create_sora_conversation.sql
97c3263e06ccb90a755fd76fc30150f8d0a8930848de793e3f7d4ebeea2a5215  supabase/migrations/20260925195603_create_sora_alerts.sql
404e6d45fabf60e9d5573b7121cdfe29c62d1fd60e9c3731ea3870cce9f30e2c  supabase/migrations/20260926154937_create_sora_research.sql
52d63aeec667121c84b940d954eaafd023cffabd3b19ea483ac359fe8f1852eb  supabase/migrations/20260927223700_drop_unused_transactions.sql
b19c538a9d9a3449c5b4492c6ccf5556209176e76d31bec2106f8dd9b9b145e7  tsconfig.json
```

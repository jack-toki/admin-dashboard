/**
 * JRL Finance — the affordability adviser.
 *
 * Two layers:
 *
 *   1. CAN you? — pure arithmetic against money that exists. The emergency floor
 *      is hard, and future income is never counted. Not next month's invoice,
 *      not "you earn well". Only what's in the pots now.
 *
 *   2. SHOULD you? — the part a calculator skips. Affordable is not the same as
 *      wise, and the default answer to a want is "wait", not "go on then".
 *
 * Saving is the first claim on every month. The monthly savings commitment comes
 * off the top before a single pound is discretionary — pay yourself first, spend
 * what's left, never the other way round. Until this month's saving is in, the
 * answer to a want is no, however much is sitting in the account.
 *
 * The second layer can override the first: it will tell you to hold off on
 * something you can comfortably afford. That's the point of it.
 */

export type Verdict = "yes" | "yes-from-savings" | "wait" | "no";
export type Advice = "buy" | "save-first" | "sleep-on-it" | "split-it" | "wait" | "dont";
export type Kind = "need" | "want";

export const GROWTH_RATE = 0.07;   // for the opportunity-cost line
export const HORIZON_YEARS = 10;

export interface AffordInput {
  price: number;
  kind: Kind;
  /** what you've given yourself to spend this month */
  monthlyBudget: number;
  /** already spent out of that budget (summed from logged purchases) */
  spentThisMonth: number;
  /** the savings pot as it stands */
  savingsPot: number;
  /** the line you won't go below, ever */
  emergencyFloor: number;
  /** what your targets need putting away each month (for the setback line) */
  targetCommitments: number;
  /** PAY YOURSELF FIRST: the monthly savings commitment, taken off the top */
  savingsFirst?: number;
  /** how much has actually gone into savings this month */
  savedThisMonth?: number;
  /** discretionary spend logged this month, for the pattern check */
  wantSpendThisMonth?: number;
  /** name of the target this would set back, if any */
  targetName?: string;
}

export interface Challenge {
  rule: string;
  point: string;
  /** true if this rule is a genuine concern, false if it passed */
  flagged: boolean;
}

export interface AffordResult {
  verdict: Verdict;
  advice: Advice;
  headline: string;
  reasoning: string;
  challenges: Challenge[];

  availableNow: number;
  savingsHeadroom: number;
  shortfall: number;
  monthsToAfford: number | null;
  floorBreach: number;
  /** what this money becomes at 7% over ten years, if left alone */
  opportunityCost: number;
  /** months this delays the named target */
  targetSetbackMonths: number | null;
  /** still to be saved this month before anything is discretionary */
  savingsGap: number;
}

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthAhead(n: number, from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, 1));
  return MONTHS[d.getUTCMonth()];
}

// ── layer 1: can you? ──────────────────────────────────────────────────────
function canYou(i: AffordInput) {
  const price = Math.max(0, i.price);

  // Saving is the first claim on the month. If no explicit commitment is set,
  // fall back to what the targets need — but never treat saving as optional.
  const commitment = Math.max(i.savingsFirst ?? 0, i.targetCommitments);
  const savingsGap = Math.max(0, commitment - (i.savedThisMonth ?? 0));

  // Discretionary money is what's left AFTER this month's saving is honoured.
  const availableNow = Math.max(
    0, i.monthlyBudget - i.spentThisMonth - savingsGap,
  );

  // The floor itself is never spendable, at any price.
  const savingsHeadroom = Math.max(0, i.savingsPot - i.emergencyFloor);

  const shortfall = Math.max(0, price - availableNow);
  const floorBreach = shortfall > savingsHeadroom ? shortfall - savingsHeadroom : 0;

  // The rate you can save towards it — from the budget you SET, never income,
  // and only out of what's left once the savings commitment is met.
  const monthlySpare = Math.max(0, i.monthlyBudget - commitment);
  const monthsToAfford =
    shortfall === 0 ? 0 : monthlySpare > 0 ? Math.ceil(shortfall / monthlySpare) : null;

  let verdict: Verdict;
  if (shortfall === 0) verdict = "yes";
  else if (floorBreach === 0) verdict = "yes-from-savings";
  else if (monthsToAfford !== null) verdict = "wait";
  else verdict = "no";

  return { price, availableNow, savingsHeadroom, shortfall, savingsGap, commitment,
           floorBreach, monthlySpare, monthsToAfford, verdict };
}

// ── layer 2: should you? ───────────────────────────────────────────────────
function buildChallenges(i: AffordInput, c: ReturnType<typeof canYou>): Challenge[] {
  const out: Challenge[] = [];
  const discretionary = c.availableNow + c.savingsHeadroom;

  // 0. Saving first — the rule that outranks the rest.
  if (c.commitment > 0) {
    out.push({
      rule: "Saving comes first",
      point: c.savingsGap > 0
        ? `${gbp(c.savingsGap)} of this month's ${gbp(c.commitment)} savings commitment still hasn't gone in. That happens before anything discretionary.`
        : `This month's ${gbp(c.commitment)} is already saved. The rest of the month is genuinely yours.`,
      flagged: c.savingsGap > 0,
    });
  }

  // 1. The old rule: if you can't buy it twice, you can't really afford it.
  const twice = c.price * 2;
  out.push({
    rule: "Pay for it twice",
    point: twice <= discretionary
      ? `You could cover ${gbp(twice)} — twice the price — and still be fine. Not a stretch.`
      : `You couldn't buy it twice. ${gbp(twice)} is beyond the ${gbp(discretionary)} you have spare, which is the old test for whether something is genuinely affordable.`,
    flagged: twice > discretionary,
  });

  // 2. What the money becomes if left alone.
  const grown = c.price * Math.pow(1 + GROWTH_RATE, HORIZON_YEARS);
  out.push({
    rule: "What it really costs",
    point: `Left in HL at 7%, ${gbp(c.price)} would be about ${gbp(grown)} in ${HORIZON_YEARS} years. That's the price you're paying.`,
    flagged: false,   // context, not an objection
  });

  // 3. Does it set a target back?
  if (i.targetName && i.targetCommitments > 0) {
    const months = Math.ceil(c.price / i.targetCommitments);
    out.push({
      rule: "Target setback",
      point: `That's ${months} month${months === 1 ? "" : "s"} of contributions to ${i.targetName}.`,
      flagged: months >= 3,
    });
  }

  // 4. This month's pattern.
  const wantSpend = i.wantSpendThisMonth ?? 0;
  if (i.monthlyBudget > 0) {
    const share = (wantSpend + (i.kind === "want" ? c.price : 0)) / i.monthlyBudget;
    out.push({
      rule: "This month so far",
      point: wantSpend > 0
        ? `You've already spent ${gbp(wantSpend)} on wants this month. With this it's ${Math.round(share * 100)}% of the budget.`
        : i.kind === "want"
          ? `Nothing else discretionary this month — this alone would be ${Math.round(share * 100)}% of the budget.`
          : `Nothing discretionary logged yet this month.`,
      flagged: share > 0.5,
    });
  }

  // 5. Want vs need — the cooling-off test.
  if (i.kind === "want") {
    out.push({
      rule: `Still want it in ${monthAhead(1)}?`,
      point: `You've marked this a want. If it's still on your mind next month it's probably real — most things aren't.`,
      flagged: c.price > i.monthlyBudget * 0.25,
    });
  }

  return out;
}

// ── the answer a real adviser would give ───────────────────────────────────
function decide(
  i: AffordInput, c: ReturnType<typeof canYou>, ch: Challenge[],
): { advice: Advice; headline: string; reasoning: string } {
  const flags = ch.filter((x) => x.flagged).length;
  const cantBuyTwice = ch.find((x) => x.rule === "Pay for it twice")?.flagged ?? false;

  // Saving outranks wanting. Until this month's saving is in, a want is a no.
  if (i.kind === "want" && c.savingsGap > 0) {
    const after = Math.max(0, i.monthlyBudget - i.spentThisMonth - c.savingsGap);
    return {
      advice: "save-first",
      headline: "Saving comes first",
      reasoning: `${gbp(c.savingsGap)} of this month's ${gbp(c.commitment)} savings still needs to go in, and that has first claim — building the pot is the point, not what's left after spending. Put it away, and you'd still have ${gbp(after)} to play with this month.`,
    };
  }

  // No path without breaking the floor. The floor doesn't bend.
  if (c.verdict === "no") {
    return {
      advice: "dont",
      headline: "No",
      reasoning: `${gbp(c.price)} is ${gbp(c.shortfall)} beyond this month's budget, and with nothing spare each month there's no path to it without changing the budget or the floor. Your emergency fund isn't the answer.`,
    };
  }

  if (c.verdict === "wait") {
    const m = c.monthsToAfford!;
    const evenThen = c.savingsHeadroom > 0
      ? ` Even using everything above your emergency fund you'd still be ${gbp(c.floorBreach)} short.`
      : ` Your savings are at the emergency floor, so they're not in play.`;
    return {
      advice: "wait",
      headline: "Not yet",
      reasoning: `${gbp(c.shortfall)} short this month.${evenThen} Put the gap aside and it clears in ${m} month${m === 1 ? "" : "s"} — ${monthAhead(m)}.`,
    };
  }

  // Affordable only by raiding savings. A need might justify it; a want doesn't.
  if (c.verdict === "yes-from-savings") {
    if (i.kind === "need") {
      return {
        advice: "buy",
        headline: "Yes, but it comes from savings",
        reasoning: `This month's budget covers ${gbp(c.availableNow)}, so ${gbp(c.shortfall)} comes out of the pot, leaving ${gbp(c.savingsHeadroom - c.shortfall)} above your emergency fund. You've marked it a need, so that's a fair use — but that money was doing a job.`,
      };
    }
    const n = c.monthlySpare > 0 ? Math.min(3, Math.ceil(c.price / c.monthlySpare)) : 0;
    return {
      advice: "split-it",
      headline: "Not from savings",
      reasoning: `You could technically cover it — ${gbp(c.shortfall)} would come out of the pot — but it's a want, and savings aren't for wants. ` +
        (n > 0
          ? `Put ${gbp(Math.ceil(c.price / n))} aside for ${n} month${n === 1 ? "" : "s"} and buy it outright in ${monthAhead(n)}. Same thing, no dent.`
          : `Save for it instead.`),
    };
  }

  // Affordable from this month's budget. Still not an automatic yes.
  if (i.kind === "need") {
    return {
      advice: "buy",
      headline: "Yes",
      reasoning: `${gbp(c.price)} leaves ${gbp(c.availableNow - c.price)} of this month's budget, with your targets and emergency fund untouched.`,
    };
  }

  if (cantBuyTwice) {
    const n = 2;
    return {
      advice: "split-it",
      headline: "Affordable — but spread it",
      reasoning: `It fits this month, but you couldn't buy it twice over, which usually means it's bigger than it feels. Put ${gbp(Math.ceil(c.price / n))} aside this month and next, buy it in ${monthAhead(n)}, and you'll have kept the month intact — and you'll know by then whether you still want it.`,
    };
  }

  if (flags >= 2) {
    return {
      advice: "sleep-on-it",
      headline: "You can. Should you?",
      reasoning: `The money's there and nothing breaks. But it's a want, and the points below are worth a second look before you commit. If it still makes sense in ${monthAhead(1)}, buy it then.`,
    };
  }

  return {
    advice: "buy",
    headline: "Yes — this one's fine",
    reasoning: `${gbp(c.price)} leaves ${gbp(c.availableNow - c.price)} this month, your targets are covered and the emergency fund is untouched. Not everything needs agonising over.`,
  };
}

export function afford(i: AffordInput): AffordResult {
  const c = canYou(i);
  const ch = buildChallenges(i, c);
  const d = decide(i, c, ch);

  return {
    verdict: c.verdict,
    advice: d.advice,
    headline: d.headline,
    reasoning: d.reasoning,
    challenges: ch,
    availableNow: c.availableNow,
    savingsHeadroom: c.savingsHeadroom,
    shortfall: c.shortfall,
    monthsToAfford: c.monthsToAfford,
    floorBreach: c.floorBreach,
    opportunityCost: c.price * Math.pow(1 + GROWTH_RATE, HORIZON_YEARS),
    targetSetbackMonths:
      i.targetName && i.targetCommitments > 0
        ? Math.ceil(c.price / i.targetCommitments)
        : null,
    savingsGap: c.savingsGap,
  };
}

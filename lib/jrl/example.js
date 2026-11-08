export const JRL_EXAMPLE_BANNER = 'SYNTHETIC FIXTURE — not a personal ledger and not a Supabase row.';

export function exampleEntries() {
  return [
    { period: '2026-08', tax_in: 100, savings_in: 200, hl_in: 150, savings_out: 0, hl_value: 1000 },
    { period: '2026-09', tax_in: 100, savings_in: 200, hl_in: 150, savings_out: 0, hl_value: null },
    { period: '2026-10', tax_in: 100, savings_in: 200, hl_in: 150, savings_out: 40, hl_value: 1400 },
  ];
}

export function exampleTargets() {
  return [
    { id: 'example-savings', name: 'Example pot', track: 'savings', scope: 'personal', target: 2000, monthly_plan: 200, rate: 0.045 },
    { id: 'example-tax', name: 'Example tax', track: 'tax', scope: 'business', target: 800, monthly_plan: 100, rate: 0.045 },
  ];
}

export function examplePurchases() {
  return [
    { id: 'example-buy', day: '02', description: 'Example purchase', amount: 25, kind: 'need', advice: 'buy' },
  ];
}

export function exampleConversations() {
  return [
    {
      id: 'example-1',
      started_at: '2026-11-08T09:00:00Z',
      trigger: 'wake',
      summary: 'Example ask',
      transcript: [
        { role: 'jack', text: 'Example question.' },
        { role: 'sora', text: 'Example reply.' },
      ],
      actions: [{ label: 'Example action', ok: true, at: '2026-11-08T09:01:00Z' }],
    },
    {
      id: 'example-2',
      started_at: '2026-11-07T09:00:00Z',
      trigger: 'alert',
      summary: 'Example alert',
      transcript: [{ role: 'system', text: 'Example system line.' }],
      actions: [{ label: 'Example failed action', ok: false, at: '2026-11-07T09:02:00Z' }],
    },
  ];
}

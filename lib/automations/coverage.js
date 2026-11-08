// Point-in-time Zapier export, file mtime 2026-11-08 02:51 GMT. Not a live probe.
// Personal names from the export are omitted. Louise was not in the export.

export const INGEST_ALIAS_HOST = 'admin-dashboard-puce-chi-32.vercel.app';
export const INGEST_PATH = '/api/ingest';

export const COVERAGE_SNAPSHOT = {
  capturedAt: '2026-11-08T02:51:00Z',
  evidence: 'local_zap_export_snapshot',
  liveHttpTested: false,
  clientAccounts: [
    { slug: 'house-to-home', on: 12, onWithIngest: 10 },
    { slug: 'interim-digital', on: 20, onWithIngest: 20 },
    { slug: 'aa-surveys', on: 19, onWithIngest: 16 },
    { slug: 'perfit-fitness', on: 8, onWithIngest: 5 },
    { slug: 'temple-brown', on: 9, onWithIngest: 7 },
    { slug: 'harewood-surveyors', on: 16, onWithIngest: 15, ingestSteps: 51, zapsWithIngest: 15 },
  ],
  clientOn: 84,
  clientOnWithIngest: 73,
  jackOwnOn: 43,
  jackOwnOnWithIngest: 0,
  louise: 'not_in_snapshot',
  otherClients: 'unknown',
  newWorkflowCountReported: { value: 22, status: 'unverified_inventory_hint' },
};

export const PROFILES_SHEET = {
  id: '1lgCOYXqiRJSJy9BehqplKvh-QyLU0qWnBt77-av9qLI',
  tab: 'profiles',
  columns: ['Account', 'Automation', 'ZapId', 'Emails', 'Quotes', 'Invoices', 'Documents', 'Leads', 'Admin', 'Notes'],
  zapIdFilledInSnapshot: 0,
  rowsInSnapshot: 81,
  modified: '2026-09-28',
};

export const ZAPIER_ONBOARDING = {
  state: 'proposed_unverified',
  listenerInstalled: false,
  newZapTrigger: 'not_shown_as_installed',
  stepInspection: 'not_supported_by_connected_manager_tools',
  registrationRoute: '/api/automations/register',
  solutionsPartner: {
    automaticAccountRegistration: false,
    accessEnumReadVerified: true,
    accessProves: 'selectable_account_only',
    accessDoesNotProve: ['role', 'grant_time', 'solutions_partner_client'],
    observerConnected: false,
    scheduled: false,
    nativeTriggerShipped: false,
    triggersAbsent: ['access_granted', 'account_joined'],
  },
  reportingStep: {
    method: 'POST',
    aliasHost: INGEST_ALIAS_HOST,
    path: '/api/ingest/<account-slug>',
    header: 'x-toki-secret',
    installedByThisApp: false,
    backfillAuthorised: false,
  },
  note: 'Solutions Partner discovery is not a connected listener. This app does not register a client when Toki is added in Zapier, and it does not insert the reporting webhook. That step stays a manual configuration until Zapton verifies a listener. Existing Zaps are not retrofitted.',
};

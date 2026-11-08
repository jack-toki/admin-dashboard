export function sheetsStatus(env = process.env) {
  const oauthReady = Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI);
  const serviceReady = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const missing = [];
  if (!env.FORECAST_SPREADSHEET_ID) missing.push('FORECAST_SPREADSHEET_ID');
  if (!oauthReady && !serviceReady) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  return {
    state: 'not_runtime_source',
    missing,
    sourceOfTruth: false,
    runtimeFetch: false,
    role: 'one_time_import_provenance',
    readOnly: true,
    writes: false,
    preferred: 'stored_forecast',
    serviceAccountOptional: true,
    oauthConfigured: oauthReady,
    requirement: 'The cockpit does not read a workbook while it is running. Stored forecast cells are the source. Google credentials do not replace a failed store read.',
  };
}

export const TOKI_SALES_CRM = {
  workspaceId: '20571424',
  listId: '901211242918',
  listName: 'Sales CRM',
};

export function clickupStatus(env = process.env) {
  const missing = [];
  if (!env.CLICKUP_API_TOKEN) missing.push('CLICKUP_API_TOKEN');
  const wrongWorkspace = env.CLICKUP_WORKSPACE_ID && env.CLICKUP_WORKSPACE_ID !== TOKI_SALES_CRM.workspaceId;
  return {
    state: wrongWorkspace ? 'error' : missing.length ? 'not_connected' : 'configured',
    missing,
    readOnly: true,
    workspaceId: TOKI_SALES_CRM.workspaceId,
    listId: TOKI_SALES_CRM.listId,
    sampleIsNotTotal: true,
    financialSales: 'manual_only',
    error: wrongWorkspace ? 'wrong_workspace' : null,
    requirement: 'A ClickUp personal token used only to read list 901211242918 in workspace 20571424. Do not use another workspace’s Sales CRM list. The token is not read from the agent session.',
  };
}

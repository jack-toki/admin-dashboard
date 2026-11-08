export function sheetsStatus(env = process.env) {
  const missing = ['GOOGLE_SERVICE_ACCOUNT_JSON', 'FORECAST_SPREADSHEET_ID'].filter((name) => !env[name]);
  return {
    state: missing.length ? 'not_connected' : 'configured',
    missing,
    readOnly: true,
    writes: false,
    requirement: 'A Google service account with scope spreadsheets.readonly, shared on the forecast workbook as Viewer. Do not publish the sheet. Set GOOGLE_SERVICE_ACCOUNT_JSON and FORECAST_SPREADSHEET_ID on the server. This agent session is not that credential.',
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

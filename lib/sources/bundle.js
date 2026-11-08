// Readers are injected. Nothing here opens a network connection.

export function createSourceBundle(adapters = {}) {
  return {
    async forecast(spreadsheetId) {
      if (typeof adapters.sheets?.readWorkbook !== 'function') {
        return { ok: false, error: 'sheets_not_connected', calledNetwork: false };
      }
      return adapters.sheets.readWorkbook(spreadsheetId);
    },
    async accountingActuals(period) {
      if (typeof adapters.xero?.profitAndLoss !== 'function') {
        return { ok: false, error: 'xero_not_connected', calledNetwork: false };
      }
      return adapters.xero.profitAndLoss(period);
    },
    async salesPipeline() {
      if (typeof adapters.clickup?.listSales !== 'function') {
        return { ok: false, error: 'clickup_not_connected', calledNetwork: false };
      }
      return adapters.clickup.listSales();
    },
  };
}

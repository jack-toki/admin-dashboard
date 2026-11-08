// Google Sheets / Excel day serials. Two-digit display years are not trusted.

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function monthKeyFromSerial(value) {
  const serial = typeof value === 'number' ? value : Number(String(value || '').trim());
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(EXCEL_EPOCH + Math.round(serial) * 86400000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthKeyFromHeader(value) {
  if (typeof value === 'number') return { key: monthKeyFromSerial(value), source: 'serial' };
  const text = String(value ?? '').trim();
  if (!text) return { key: null, source: 'blank' };
  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    return { key: monthKeyFromSerial(Number(text)), source: 'serial' };
  }
  const full = text.match(/^([A-Za-z]+)\s+(20\d{2})$/);
  if (full) {
    const month = new Date(`${full[1]} 1, ${full[2]}`).getUTCMonth();
    if (!Number.isNaN(month)) return { key: `${full[2]}-${String(month + 1).padStart(2, '0')}`, source: 'text' };
  }
  if (/^\d{1,2}\s+\w+\s+20\d{2}$/.test(text) || /^20\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return { key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, source: 'text' };
    }
  }
  return { key: null, source: 'ambiguous_header', warning: 'header_not_used', rawShape: text.replace(/[A-Za-z]/g, 'A').replace(/\d/g, 'D') };
}

export function crmDealView(deal) {
  const stars = Number.isInteger(deal.confidenceStars) ? deal.confidenceStars : null;
  const won = String(deal.status || '').toLowerCase() === 'closed won';
  return {
    leadId: deal.leadId,
    status: deal.status || null,
    amountMinor: deal.amountMinor ?? null,
    currency: deal.currency || null,
    confidenceStars: stars,
    confidenceIsProbability: false,
    deadline: deal.deadline || null,
    deadlineIsCloseDate: false,
    wonDate: won ? (deal.dateClosed ? 'present' : 'unknown') : null,
    inFinancialPlan: false,
  };
}

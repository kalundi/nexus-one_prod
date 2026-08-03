const DRIVER_ACCEPTABLE_STATUSES = new Set(['ASSIGNED', 'SCHEDULED', 'REQUESTED', 'SUBMITTED']);

function isDriverAssignableStatus(status) {
  const normalized = String(status || '').trim().toUpperCase().replaceAll('-', '_');
  return DRIVER_ACCEPTABLE_STATUSES.has(normalized);
}

function normalizeDriverAcceptanceStatus(status) {
  return isDriverAssignableStatus(status) ? 'EN_ROUTE' : String(status || '').trim().toUpperCase().replaceAll('-', '_') || 'EN_ROUTE';
}

module.exports = {
  DRIVER_ACCEPTABLE_STATUSES,
  isDriverAssignableStatus,
  normalizeDriverAcceptanceStatus
};

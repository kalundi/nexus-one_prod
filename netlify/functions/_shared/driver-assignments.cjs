const DRIVER_ACCEPTABLE_STATUSES = new Set(['ASSIGNED', 'SCHEDULED', 'REQUESTED', 'SUBMITTED']);

function isDriverAssignableStatus(status) {
  const normalized = String(status || '').trim().toUpperCase().replaceAll('-', '_');
  return DRIVER_ACCEPTABLE_STATUSES.has(normalized);
}

function normalizeDriverAcceptanceStatus(status) {
  return isDriverAssignableStatus(status) ? 'ASSIGNED' : String(status || '').trim().toUpperCase().replaceAll('-', '_') || 'ASSIGNED';
}

module.exports = {
  DRIVER_ACCEPTABLE_STATUSES,
  isDriverAssignableStatus,
  normalizeDriverAcceptanceStatus
};

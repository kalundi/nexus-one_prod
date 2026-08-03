const ASSIGNMENT_TRIGGER_STATUSES = new Set(['SUBMITTED', 'REQUESTED', 'SCHEDULED']);

function resolveAssignedStatus(currentStatus) {
  const normalized = String(currentStatus || '').trim().toUpperCase().replaceAll('-', '_');
  return ASSIGNMENT_TRIGGER_STATUSES.has(normalized) ? 'ASSIGNED' : normalized || 'SUBMITTED';
}

module.exports = {
  ASSIGNMENT_TRIGGER_STATUSES,
  resolveAssignedStatus
};

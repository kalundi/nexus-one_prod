function canAdvanceBookingForAvailability({ currentStatus, nextStatus, availability }) {
  const hasDrivers = Number(availability?.drivers?.available || 0) > 0;
  const hasVehicles = Number(availability?.vehicles?.available || 0) > 0;
  const available = Boolean(availability?.available) && hasDrivers && hasVehicles;

  if (!available) {
    return {
      allowed: false,
      message: 'Dispatch approval requires an available driver and vehicle for this trip.'
    };
  }

  return {
    allowed: true,
    message: 'Approval allowed'
  };
}

module.exports = { canAdvanceBookingForAvailability };

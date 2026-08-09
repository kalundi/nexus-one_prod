function buildDriverEmployeeLookupSql(alias = 'e', usersAlias = 'u') {
  return {
    select: `${alias}.display_name AS display_name, ${usersAlias}.scope_id AS scope_id, ${alias}.email AS email, ${alias}.phone AS phone`,
    join: `LEFT JOIN users ${usersAlias} ON ${alias}.user_id = ${usersAlias}.id`
  };
}

function buildDriverEmployeeDispatchColumns(alias = 'e', usersAlias = 'u') {
  return `${alias}.id, ${alias}.display_name AS name, ${usersAlias}.scope_id AS scope_id, ${alias}.active`;
}

function buildDriverAvailabilitySql(alias = 'e', usersAlias = 'u') {
  return `
    SELECT COUNT(DISTINCT ${alias}.id) AS driver_count
    FROM employees ${alias}
    INNER JOIN employee_shifts es ON ${alias}.id=es.employee_id
    LEFT JOIN users ${usersAlias} ON ${alias}.user_id = ${usersAlias}.id
    WHERE ${alias}.role='DRIVER' AND ${alias}.active=true AND es.active=true
      AND es.weekday_iso=$1
      AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
      AND es.effective_start_date<=$3::date
      AND (es.effective_end_date IS NULL OR es.effective_end_date>=$3::date)
  `;
}

module.exports = {
  buildDriverEmployeeLookupSql,
  buildDriverEmployeeDispatchColumns,
  buildDriverAvailabilitySql
};

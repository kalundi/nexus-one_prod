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
    SELECT COUNT(DISTINCT ${alias}.id) AS available
    FROM employees ${alias}
    INNER JOIN employee_shifts es ON ${alias}.id=es.employee_id
    LEFT JOIN users ${usersAlias} ON ${alias}.user_id = ${usersAlias}.id
    WHERE ${alias}.role='DRIVER' AND ${alias}.active=true AND es.active=true
      AND ${usersAlias}.scope_id IS NOT NULL
  `;
}

module.exports = {
  buildDriverEmployeeLookupSql,
  buildDriverEmployeeDispatchColumns,
  buildDriverAvailabilitySql
};

exports.up = function(knex) {
  return knex.schema.table('games', table => {
    table.string('status', 20).defaultTo('waiting_for_ready');
  });
};

exports.down = function(knex) {
  return knex.schema.table('games', table => {
    table.dropColumn('status');
  });
};
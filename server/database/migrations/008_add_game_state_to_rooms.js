exports.up = function(knex) {
  return knex.schema.table('rooms', table => {
    table.jsonb('game_state').defaultTo('{}');
    table.string('current_problem_id', 100);
    table.timestamp('game_started_at');
    table.timestamp('game_ends_at');
  });
};

exports.down = function(knex) {
  return knex.schema.table('rooms', table => {
    table.dropColumn('game_state');
    table.dropColumn('current_problem_id');
    table.dropColumn('game_started_at');
    table.dropColumn('game_ends_at');
  });
};
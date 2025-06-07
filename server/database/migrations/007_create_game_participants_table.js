exports.up = function(knex) {
  return knex.schema.createTable('game_participants', table => {
    table.uuid('participant_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('game_id').references('game_id').inTable('games').onDelete('CASCADE');
    table.uuid('user_id').references('user_id').inTable('users').onDelete('CASCADE');
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time');
    table.boolean('solved').defaultTo(false);
    table.integer('solve_time'); // seconds taken to solve
    table.integer('points_earned').defaultTo(0);
    table.integer('final_position');
    table.integer('elo_change').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['game_id']);
    table.index(['user_id']);
    table.unique(['game_id', 'user_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('game_participants');
};
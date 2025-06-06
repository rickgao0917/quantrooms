exports.up = function(knex) {
  return knex.schema.createTable('games', function(table) {
    // Primary key
    table.uuid('game_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Game associations
    table.uuid('room_id').references('room_id').inTable('rooms').onDelete('CASCADE');
    table.string('problem_id', 100).notNullable();
    
    // Game details
    table.jsonb('participants').notNullable(); // Array of {user_id, username, elo_before}
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time');
    table.uuid('winner_id').references('user_id').inTable('users').onDelete('SET NULL');
    
    // Results
    table.jsonb('final_scores'); // Array of {user_id, points, solve_time, position}
    table.jsonb('elo_changes'); // Array of {user_id, elo_before, elo_after, change}
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('room_id');
    table.index('problem_id');
    table.index('created_at');
    table.index('winner_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('games');
};
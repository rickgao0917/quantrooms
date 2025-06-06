exports.up = function(knex) {
  return knex.schema.createTable('rooms', function(table) {
    // Primary key
    table.uuid('room_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Room details
    table.string('name', 100).notNullable();
    table.uuid('creator_id').references('user_id').inTable('users').onDelete('SET NULL');
    table.uuid('current_host_id').references('user_id').inTable('users').onDelete('SET NULL');
    
    // Room settings
    table.integer('max_players').defaultTo(8);
    table.integer('current_players').defaultTo(0);
    table.integer('elo_min').defaultTo(0);
    table.integer('elo_max').defaultTo(3000);
    table.enum('status', ['waiting', 'active', 'finished']).defaultTo('waiting');
    table.enum('difficulty', ['Easy', 'Medium', 'Hard', 'Mixed']).defaultTo('Medium');
    
    // Room configuration (stored as JSONB)
    table.jsonb('settings').defaultTo('{}');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_activity').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('status');
    table.index('created_at');
    table.index('last_activity');
    table.index(['elo_min', 'elo_max']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('rooms');
};
exports.up = function(knex) {
  return knex.schema.createTable('user_sessions', function(table) {
    // Primary key
    table.uuid('session_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Session details
    table.uuid('user_id').references('user_id').inTable('users').onDelete('CASCADE');
    table.text('refresh_token').unique().notNullable();
    table.string('device_info', 255);
    table.string('ip_address', 45);
    
    // Token management
    table.boolean('is_valid').defaultTo(true);
    table.timestamp('expires_at').notNullable();
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_used').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('user_id');
    table.index('refresh_token');
    table.index('expires_at');
    table.index('is_valid');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('user_sessions');
};
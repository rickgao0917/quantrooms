exports.up = function(knex) {
  return knex.schema.createTable('room_participants', function(table) {
    // Composite primary key
    table.uuid('room_id').references('room_id').inTable('rooms').onDelete('CASCADE');
    table.uuid('user_id').references('user_id').inTable('users').onDelete('CASCADE');
    
    // Participant details
    table.boolean('is_host').defaultTo(false);
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.enum('status', ['active', 'disconnected', 'left']).defaultTo('active');
    
    // Composite primary key
    table.primary(['room_id', 'user_id']);
    
    // Indexes
    table.index('user_id');
    table.index('status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('room_participants');
};
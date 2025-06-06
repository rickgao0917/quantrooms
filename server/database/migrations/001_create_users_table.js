exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    // Primary key
    table.uuid('user_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Authentication fields
    table.string('email', 255).unique().notNullable();
    table.string('google_id', 255).unique();
    table.string('username', 50).notNullable();
    table.string('password_hash', 255); // Null for Google OAuth users
    
    // User profile and stats
    table.integer('elo_rating').defaultTo(1200);
    table.integer('games_played').defaultTo(0);
    table.integer('total_wins').defaultTo(0);
    table.integer('total_points').defaultTo(0);
    
    // Account status
    table.boolean('email_verified').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_active').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('email');
    table.index('google_id');
    table.index('username');
    table.index('elo_rating');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
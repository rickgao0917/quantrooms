const knex = require('knex');
const knexConfig = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const connectionConfig = knexConfig[environment];

const connection = knex(connectionConfig);

// Test database connection
connection.raw('SELECT 1')
  .then(() => {
    console.log('✅ Database connected successfully');
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    console.error('Please ensure PostgreSQL is running and the database exists');
  });

// Log query times in development
if (environment === 'development') {
  connection.on('query', (data) => {
    console.log('🔍 SQL Query:', data.sql.substring(0, 100) + '...');
  });
}

module.exports = connection;
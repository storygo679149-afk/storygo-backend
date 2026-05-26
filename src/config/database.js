const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('./environment');

console.log('DATABASE_URL present:', !!environment.DATABASE_URL);
if (environment.DATABASE_URL) {
  console.log('DATABASE_URL starts with:', environment.DATABASE_URL.substring(0, 30) + '...');
} else {
  console.error('❌ DATABASE_URL is not defined in environment variables');
}

const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  ssl: environment.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  statement_timeout: 60000,
  query_timeout: 60000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Test database connection with full error logging
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', res.rows[0].now);
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    if (err.stack) console.error('Stack:', err.stack);
    console.error('Connection string (hidden pass):', environment.DATABASE_URL?.replace(/:[^:@]*@/, ':****@'));
    return false;
  }
};

pool.on('connect', (client) => {
  console.log('🔌 New database client connected');
});

pool.on('remove', (client) => {
  console.log('🔌 Database client removed');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected database error:', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (environment.NODE_ENV === 'development' && duration > 100) {
      console.log('⚠️ Slow query:', { text: text.substring(0, 100), duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('❌ Database query error:', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  return client;
};

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('📦 Initializing database...');
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const indexesPath = path.join(__dirname, '../../database/indexes.sql');
    
    if (!fs.existsSync(schemaPath)) throw new Error(`Schema file not found: ${schemaPath}`);
    if (!fs.existsSync(indexesPath)) throw new Error(`Indexes file not found: ${indexesPath}`);
    
    const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
    const indexesSQL = fs.readFileSync(indexesPath, 'utf-8');
    
    await client.query('BEGIN');
    await client.query(schemaSQL);
    console.log('✅ Database schema created/updated successfully');
    await client.query(indexesSQL);
    console.log('✅ Database indexes created/updated successfully');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Test connection immediately
testConnection();

module.exports = { pool, query, getClient, initializeDatabase, testConnection };
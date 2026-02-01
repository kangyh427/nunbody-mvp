const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  try {
    console.log('🗄️  Initializing database...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    
    console.log('✅ Database tables created successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    if (!error.message.includes('already exists')) {
      throw error;
    } else {
      console.log('ℹ️  Tables already exist, skipping...');
    }
  }
}

module.exports = initializeDatabase;

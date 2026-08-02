const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Script = require('./src/models/Script');

// Load environment variables
dotenv.config();

async function migrateScriptsStatus() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-knowledge', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB successfully');

    // Find all scripts that don't have the isActive field
    console.log('🔍 Finding scripts without isActive field...');
    const scriptsWithoutStatus = await Script.find({ 
      isActive: { $exists: false } 
    });

    console.log(`📊 Found ${scriptsWithoutStatus.length} scripts without isActive field`);

    if (scriptsWithoutStatus.length === 0) {
      console.log('✅ All scripts already have the isActive field. No migration needed.');
      return;
    }

    // Update all scripts without isActive field to be active by default
    console.log('🔄 Updating scripts to add isActive: true...');
    const updateResult = await Script.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );

    console.log(`✅ Migration completed successfully!`);
    console.log(`📈 Updated ${updateResult.modifiedCount} scripts`);
    console.log(`📋 Matched ${updateResult.matchedCount} scripts`);

    // Verify the migration
    console.log('🔍 Verifying migration...');
    const remainingScriptsWithoutStatus = await Script.find({ 
      isActive: { $exists: false } 
    });

    if (remainingScriptsWithoutStatus.length === 0) {
      console.log('✅ Migration verification successful - all scripts now have isActive field');
    } else {
      console.log(`⚠️  Warning: ${remainingScriptsWithoutStatus.length} scripts still missing isActive field`);
    }

    // Show statistics
    const totalScripts = await Script.countDocuments();
    const activeScripts = await Script.countDocuments({ isActive: true });
    const inactiveScripts = await Script.countDocuments({ isActive: false });

    console.log('\n📊 Final Statistics:');
    console.log(`   Total scripts: ${totalScripts}`);
    console.log(`   Active scripts: ${activeScripts}`);
    console.log(`   Inactive scripts: ${inactiveScripts}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    console.log('🔌 Closing database connection...');
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
}

// Run the migration
console.log('🚀 Starting script status migration...');
console.log('📅 Migration date:', new Date().toISOString());
console.log('🎯 Purpose: Add isActive field to existing scripts');
console.log('=' .repeat(50));

migrateScriptsStatus()
  .then(() => {
    console.log('\n🎉 Migration process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration process failed:', error);
    process.exit(1);
  }); 
/**
 * One-time migration: lock down every existing episode's audio file on
 * Cloudinary so it requires a signed URL, without needing to re-upload
 * anything.
 *
 * Run this ONCE after deploying the code changes:
 *   node scripts/lockdown-existing-audio.js
 *
 * Safe to re-run — already-locked files are simply updated again with
 * no side effects.
 */
const { query, pool } = require('../src/config/database');
const { lockdownAudioAsset } = require('../src/config/cloudinary');

async function run() {
  const result = await query(
    'SELECT id, audio_public_id FROM episodes WHERE audio_public_id IS NOT NULL'
  );

  console.log(`Found ${result.rows.length} episodes to lock down.`);

  let success = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      await lockdownAudioAsset(row.audio_public_id);
      success++;
      console.log(`✅ Locked: ${row.id} (${row.audio_public_id})`);
    } catch (err) {
      failed++;
      console.error(`❌ Failed: ${row.id} (${row.audio_public_id}) — ${err.message}`);
    }
  }

  console.log(`\nDone. ${success} locked, ${failed} failed.`);
  if (pool) await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

#!/usr/bin/env node
/*
 Simple utility to reset a user's password from the command line.
 Usage:
  node resetPassword.js --email user@example.com --password newPass123
  or
  node resetPassword.js --id 1 --password newPass123

This script uses bcryptjs (pure JS) to create a hash and updates the Users table.
Make sure you run `npm install bcryptjs` in the Backend folder first.
*/

const pool = require('./db.js');
const bcrypt = require('bcryptjs');

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i+1]) { out.email = argv[++i]; }
    else if (a === '--id' && argv[i+1]) { out.id = argv[++i]; }
    else if (a === '--password' && argv[i+1]) { out.password = argv[++i]; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  if (args.help || (!args.email && !args.id) || !args.password) {
    console.log('\nUsage:');
    console.log('  node resetPassword.js --email user@example.com --password newPass123');
    console.log('  or');
    console.log('  node resetPassword.js --id 1 --password newPass123');
    console.log('\nMake sure you run `npm install bcryptjs` in the Backend folder first.');
    process.exit(1);
  }

  try {
    const saltRounds = 10;
    const hash = bcrypt.hashSync(args.password, saltRounds);

    let res;
    if (args.email) {
      res = await pool.query('UPDATE "Users" SET "PasswordHash" = $1 WHERE "Email" = $2 RETURNING "UserID", "Email"', [hash, args.email]);
    } else {
      res = await pool.query('UPDATE "Users" SET "PasswordHash" = $1 WHERE "UserID" = $2 RETURNING "UserID", "Email"', [hash, args.id]);
    }

    if (res.rowCount === 0) {
      console.error('No user updated. Check that the Email or UserID exists.');
      process.exitCode = 2;
    } else {
      console.log('Password updated for user:', res.rows[0]);
    }
  } catch (err) {
    console.error('Error updating password:', err);
    process.exitCode = 3;
  } finally {
    // close pool
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

main();

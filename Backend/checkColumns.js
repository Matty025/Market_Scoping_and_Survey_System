const pool = require("./db");

(async () => {
  try {
    const table = process.argv[2] || "ProcurementFiles";
    const { rows } = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position` ,
      [table]
    );
    console.log(`Columns for ${table}:`);
    rows.forEach((row) => console.log(`- ${row.column_name} (${row.data_type})`));
  } catch (err) {
    console.error("Failed to list columns:", err);
  } finally {
    await pool.end();
  }
})();

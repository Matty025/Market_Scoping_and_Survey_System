const pool = require("../db");

module.exports = {
  // FIND USER BY EMAIL
  findByEmail: async (email) => {
    const result = await pool.query(
      `SELECT u.*, r.role_name AS role
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.email = $1`,
      [email]
    );

    return result.rows[0];
  },

  // CREATE USER
  createUser: async (fullName, email, passwordHash, roleId) => {
    const result = await pool.query(
      `INSERT INTO users (fullname, email, passwordhash, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [fullName, email, passwordHash, roleId]
    );

    return result.rows[0];
  },
};

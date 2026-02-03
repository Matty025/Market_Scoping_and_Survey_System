const jwt = require('jsonwebtoken');
const pool = require('../db');

// Middleware to protect routes
const protect = async (req, res, next) => {
  let token;

  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Look up current status to catch newly-blacklisted accounts
    const { rows } = await pool.query(
      `SELECT u."UserID", u."AccountStatus", r."RoleName"
         FROM "Users" u
         LEFT JOIN "Roles" r ON r."RoleID" = u."RoleID"
        WHERE u."UserID" = $1`,
      [decoded.userID]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const status = (rows[0].AccountStatus || '').toUpperCase();
    if (status === 'BLACKLISTED') {
      return res.status(403).json({ message: 'Account blacklisted' });
    }

    req.user = {
      ...decoded,
      role: rows[0].RoleName || decoded.role,
      accountStatus: status,
    };

    return next();
  } catch (error) {
    console.error('[authMiddleware] auth failed:', error.message);
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

module.exports = { protect };

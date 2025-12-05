const jwt = require('jsonwebtoken');

// Middleware to protect routes
const protect = (req, res, next) => {
  let token;
  console.log("[authMiddleware.js] Protect middleware entered.");
  console.log("[authMiddleware.js] Authorization header:", req.headers.authorization);

  // Check for the token in the Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];

    if (!token) {
      console.warn("[authMiddleware.js] Bearer token missing after split.");
      return res.status(401).json({ message: 'Not authorized, token missing' });
    }

    try {
      // Verify the token using your JWT secret
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach the decoded payload to req.user for use in routes
      req.user = decoded; // e.g., { userID, role }
      console.log("[authMiddleware.js] Token verified. User:", req.user.userID, "Role:", req.user.role);
      return next();
    } catch (error) {
      console.error("[authMiddleware.js] Token verification failed:", error.message);
      return res.status(401).json({ message: 'Not authorized, token invalid' });
    }
  } else {
    console.warn("[authMiddleware.js] No Authorization header or not in Bearer format.");
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

module.exports = { protect };

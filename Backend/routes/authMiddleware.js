const jwt = require('jsonwebtoken');

// This middleware will be used to protect routes
const protect = (req, res, next) => {
  let token;
  console.log("[authMiddleware.js] Protect middleware entered.");

  // Check for the token in the Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header (e.g., "Bearer <token>")
      token = req.headers.authorization.split(' ')[1];

      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach the user's payload to the request object for use in other routes
      req.user = decoded; // The payload from your JWT (e.g., { userID, role })
      console.log("[authMiddleware.js] Token verified. User:", req.user.userID, "Role:", req.user.role);
      next(); // Proceed to the next middleware/route handler
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    console.log("[authMiddleware.js] No Authorization header or not Bearer token.");
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };
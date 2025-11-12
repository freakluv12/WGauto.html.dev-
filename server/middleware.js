// ==================== server/middleware.js ====================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// JWT_SECRET - generate if not set
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    JWT_SECRET = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  WARNING: JWT_SECRET not set! Generated random secret for this session.');
    console.warn('⚠️  Set JWT_SECRET in environment variables for production!');
    console.warn('⚠️  Add this to your .env: JWT_SECRET=' + JWT_SECRET);
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };

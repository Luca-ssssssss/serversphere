const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        
        req.user = user;
        next();
    });
}

function authorizeRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                required: roles,
                current: req.user.role 
            });
        }
        
        next();
    };
}

function rateLimitMiddleware(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 100;
    
    req.rateLimit = req.rateLimit || {};
    req.rateLimit[ip] = req.rateLimit[ip] || { count: 0, resetTime: now + windowMs };
    
    if (now > req.rateLimit[ip].resetTime) {
        req.rateLimit[ip] = { count: 0, resetTime: now + windowMs };
    }
    
    if (req.rateLimit[ip].count >= maxRequests) {
        return res.status(429).json({ 
            error: 'Too many requests',
            retryAfter: Math.ceil((req.rateLimit[ip].resetTime - now) / 1000)
        });
    }
    
    req.rateLimit[ip].count++;
    next();
}

module.exports = {
    authenticateToken,
    authorizeRole,
    rateLimitMiddleware
};
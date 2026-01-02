const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq7LpbB6pJ/1HlTpV2QZ8ZzXlTqJXa', // password
        email: 'admin@serversphere.local',
        role: 'admin',
        createdAt: new Date()
    }
];

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );
    
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        }
    });
});

router.post('/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: users.length + 1,
        username,
        password: hashedPassword,
        email,
        role: 'user',
        createdAt: new Date()
    };
    
    users.push(newUser);
    
    const token = jwt.sign(
        { userId: newUser.id, username: newUser.username, role: newUser.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );
    
    res.status(201).json({
        token,
        user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role
        }
    });
});

router.get('/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) return res.status(401).json({ error: 'User not found' });
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const register = async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: 'Username taken or invalid' });
    }
};

const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
            res.json({ token, username: user.username, id: user.id });
        } else {
            res.status(403).json({ error: 'Invalid password' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
};

module.exports = { authenticateToken, register, login };
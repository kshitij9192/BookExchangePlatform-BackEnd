const express = require('express');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

// Database connection
const client = new Client({
    host: process.env.DB_HOST,
        user: process.env.DB_USER,
        port: process.env.DB_PORT,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
});

client.connect();

// Middleware to parse JSON bodies
app.use(express.json());

// Register a new user
app.post('/register', async (req, res) => {
    try{
    const { username, email, password } = req.body;

    
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        console.log("username", username);
        const result = await client.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *', [username, email, hashedPassword]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user');
    }
});

// Login route
app.post('/login', async (req, res) => {
   

    try {
        const {email, password } = req.body;
        // Retrieve the user from the database
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);

        const user = result.rows[0];
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Check if the password is correct
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).send('Invalid password');
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.userid, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Error logging in');
    }
});

// Middleware to authenticate requests using JWT token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).send('Access denied. Token is missing');
    }
    try{

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
}catch(error){
    console.error("Token verification failed:",error.message);
    res.status(401).json({message: "Invalid token"});
}
}

// Protected route
app.get('/userinfo', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route', user: req.user });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Database connection pool
const client = new Client({
    host: process.env.DB_HOST,
        user: process.env.DB_USER,
        port: process.env.DB_PORT,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
});

client.connect();

async function getUserIdByUsername(username) {
    try {
        const query = 'SELECT id FROM users WHERE username = $1';
        const result = await client.query(query, [username]);

        if (result.rows.length > 0) {
            return result.rows[0].id;
        } else {
            return null; // Username not found
        }
    } catch (error) {
        console.error('Error fetching lender ID by username:', error);
        throw error;
    }
}


// API endpoints

// 1. When a user logs in, display all available books excluding books he added

app.get('/:username/available-books', async (req, res) => {
    const username = req.params.username;
    const { genre, title, author } = req.query;

    try {
        const lenderId = await getUserIdByUsername(username);
        console.log('lenderId: ', lenderId);
        if (!lenderId) {
            return res.status(404).json({ error: 'User not found' });
        }

        let query = 'SELECT * FROM books WHERE lender_id != $1 AND availability_status = true';
        const queryParams = [lenderId];
        let paramCount = 1; // Parameter counter for dynamic query building

        // Add search conditions if search parameters are provided
        if (genre) {
            query += ` AND genre ILIKE $${++paramCount}`;
            queryParams.push(`%${genre}%`);
        }
        if (title) {
            query += ` AND title ILIKE $${++paramCount}`;
            queryParams.push(`%${title}%`);
        }
        if (author) {
            query += ` AND author ILIKE $${++paramCount}`;
            queryParams.push(`%${author}%`);
        }

        const result = await client.query(query, queryParams);
        const availableBooks = result.rows;

        if (availableBooks.length === 0) {
            return res.status(200).json({ message: 'No available books match the search criteria' });
        }

        res.status(200).json(availableBooks);
    } catch (err) {
        console.error('Error fetching available books:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// 2. API to add a book with details like title, author, genre and set lender_id with that user
app.post('/:username/add-book', async (req, res) => {
    const username = req.params.username;
    const { title, author, genre } = req.body;
    
    try {

        const lenderId = await getUserIdByUsername(username);
        console.log('lenderId: ',lenderId);
        if (!lenderId) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Check if a book with the same title and lender ID already exists
        const existingBook = await client.query('SELECT * FROM books WHERE title = $1 AND lender_id = $2', [title, lenderId]);

        if (existingBook.rows.length > 0) {
            // Book already exists, return a 409 Conflict response
            return res.status(409).json({ error: 'A book with the same title and lender ID already exists' });
        }

        // Book doesn't exist, proceed with inserting the new book
        const result = await client.query('INSERT INTO books (title, author, genre, lender_id) VALUES ($1, $2, $3, $4) RETURNING *', [title, author, genre, lenderId]);
        const addedBook = result.rows[0];
        
        res.status(201).json(addedBook);
    } catch (err) {
        console.error('Error adding book:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// 3. API to display only books which user has added with their status
app.get('/:username/added-books', async (req, res) => {
    const username = req.params.username;
    try {
        const lenderId = await getUserIdByUsername(username);
        console.log('lenderId: ',lenderId);
        if (!lenderId) {
            return res.status(404).json({ error: 'User not found' });
        }
        const result = await client.query('SELECT * FROM books WHERE lender_id = $1', [lenderId]);
        const userBooks = result.rows;
        if (userBooks.length === 0) {
            return res.status(200).json({ message: 'No Books have been added' });
        }
        res.status(200).json(userBooks);
    } catch (err) {
        console.error('Error fetching user books:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 4. API endpoint to create an exchange request
app.post('/:username/create-exchange-request', async (req, res) => {
    const requesterUsername = req.params.username;
    const { lender_id, book_id } = req.body;

    try {
        // Retrieve requester ID based on requester username
        const requesterId = await getUserIdByUsername(requesterUsername);
        console.log("requesterId: ",requesterId);
        if (!requesterId) {
            return res.status(404).json({ error: 'Requester not found' });
        }

        console.log("bookId: ",book_id);
        console.log("lenderId: ",lender_id);

        // Check if the book exists and is owned by the lender
        const book = await client.query('SELECT * FROM books WHERE id = $1 AND lender_id = $2', [book_id, lender_id]);
        if (book.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found or not owned by the lender' });
        }

        // Insert the exchange request into the database
        const insertQuery = 'INSERT INTO exchange_requests (lender_id, requester_id, book_id) VALUES ($1, $2, $3) RETURNING *';
        const result = await client.query(insertQuery, [lender_id, requesterId, book_id]);
        const exchangeRequest = result.rows[0];

        res.status(201).json(exchangeRequest);
    } catch (error) {
        // Check if the error is due to a unique constraint violation
        if (error.code === '23505' && error.constraint === 'unique_requester_book') {
            return res.status(409).json({ error: 'You have already sent a request for this book' });
        }
        console.error('Error creating exchange request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//5. API to view books for which requests have been sent by the requester
app.get('/:username/sent-requests', async (req, res) => {
    const requesterUsername = req.params.username;

    try {
        // Retrieve requester ID based on requester username
        const requesterId = await getUserIdByUsername(requesterUsername);
        if (!requesterId) {
            return res.status(404).json({ error: 'Requester not found' });
        }

        // Query exchange requests where the requester is the requester
        const query = `
            SELECT books.*
            FROM exchange_requests
            INNER JOIN books ON exchange_requests.book_id = books.id
            WHERE exchange_requests.requester_id = $1;
        `;
        const result = await client.query(query, [requesterId]);
        const books = result.rows;

        if (books.length === 0) {
            return res.status(200).json({ message: 'No Requests' });
        }

        res.status(200).json(books);
    } catch (error) {
        console.error('Error fetching sent requests:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//6. API to view books for which requests have been sent to the lender
app.get('/:username/received-requests', async (req, res) => {
    const lenderUsername = req.params.username;

    try {
        // Retrieve lender ID based on lender username
        const lenderId = await getUserIdByUsername(lenderUsername);
        if (!lenderId) {
            return res.status(404).json({ error: 'Lender not found' });
        }

        // Query exchange requests where the lender is the lender
        const query = `
            SELECT books.*
            FROM exchange_requests
            INNER JOIN books ON exchange_requests.book_id = books.id
            WHERE exchange_requests.lender_id = $1;
        `;
        const result = await client.query(query, [lenderId]);
        const books = result.rows;

        if (books.length === 0) {
            return res.status(200).json({ message: 'No Requests' });
        }
        res.status(200).json(books);
    } catch (error) {
        console.error('Error fetching received requests:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

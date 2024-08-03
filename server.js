
const express = require('express');
const formidable = require('formidable');
const { Pool } = require('pg'); // Import pg for PostgreSQL
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 3000;
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const sharp = require('sharp');

// Replace 'YOUR_BOT_TOKEN_HERE' with your actual bot token from BotFather
const bot = new Telegraf('6943135495:AAG_43_g0BJYcpsPdFliJSXVQz-dit-iyhY');
const botToken = '6943135495:AAG_43_g0BJYcpsPdFliJSXVQz-dit-iyhY'
// Create a new instance of the TelegramBot class
// PostgreSQL connection

const client = new Pool({
    connectionString: 'postgresql://wifi_db_user:yGEtjMFrhK3m0oG8Tc8hglOqn9CaIhLT@dpg-cqj2e9mehbks73c4mh60-a.oregon-postgres.render.com/wifi_db',
    ssl: { rejectUnauthorized: false }
});
client.connect();

// Middleware to handle CORS
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('./'));

// Ensure the tables exist
client.query(`
CREATE TABLE IF NOT EXISTS transfers (
    id SERIAL PRIMARY KEY,
    tx_id TEXT,
    amount REAL,
    user_id TEXT,  -- Changed from 'user'
    wallet_address TEXT
);

`, (err) => {
    if (err) {
        console.error('Error creating transactions table:', err.message);
    }
});
// Ensure the admin_users table exists
client.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
        user_id TEXT PRIMARY KEY
    )
`, (err) => {
    if (err) {
        console.error('Error creating admin_users table:', err.message);
    }
});

client.query(`
    CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        longitude REAL,
        latitude REAL,
        weight REAL,
        price REAL,
        name TEXT,
        type TEXT,
        identifier TEXT UNIQUE,
        product_image BYTEA,
        location_image BYTEA,
        location TEXT
    )
`, (err) => {
    if (err) {
        console.error('Error creating products table:', err.message);
    }
});



client.query(`CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    location_name TEXT UNIQUE
)
`, (err) => {
    if (err) {
        console.error('Error creating tables:', err.message);
    }
});



app.get('/api/categories', async (req, res) => {
    try {
        // Log the start of the request
        console.log('Received request for /api/categories');

        // Fetch cities from the database
        const result = await client.query('SELECT id, categorie_name FROM categ'); // Adjust as needed

        // Log the fetched cities
        console.log('Fetched cities:', result.rows);

        // Respond with the cities
        res.json({ cities: result.rows });
    } catch (error) {
        // Log detailed error information
        console.error('Error fetching cities:', error.message);
        console.error('Stack trace:', error.stack);

        // Respond with a 500 status and error message
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

app.get('/', (req, res) => {
    // Get the IP address of the client
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.send(`Your IP address is: ${ip}`);
});
app.get('/api/locations', async (req, res) => {
    try {
        // Log the start of the request
        console.log('Received request for /api/locations with cityId:', req.query.cityId);

        // Get the cityId from query parameters
        const cityId = req.query.cityId;

        if (!cityId) {
            return res.status(400).json({ error: 'City ID is required' });
        }

        // Fetch locations for the specified city from the database
        const result = await client.query(
            'SELECT id, location_name FROM locations WHERE city_id = $1',
            [cityId]
        );

        // Log the fetched locations
        console.log('Fetched locations:', result.rows);

        // Respond with the locations
        res.json({ locations: result.rows });
    } catch (error) {
        // Log detailed error information
        console.error('Error fetching locations:', error.message);
        console.error('Stack trace:', error.stack);

        // Respond with a 500 status and error message
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

app.post('/removeLocation', async (req, res) => {
    try {
        // Extract the location name from the request body
        const { location_name } = req.body;

        // Ensure the location name is provided
        if (!location_name) {
            return res.status(400).json({ error: 'Location name is required' });
        }

        // Query to delete the location by name (assuming a unique constraint or handling is in place)
        const result = await client.query('DELETE FROM locations WHERE location_name = $1 RETURNING *', [location_name]);

        // Check if a location was deleted
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        // Respond with a success message
        res.status(200).json({ message: 'Location removed successfully' });
    } catch (error) {
        // Handle any errors
        console.error('Error removing location:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/addlocation', async (req, res) => {
    const { location_name } = req.body;

    if (!location_name) {
        return res.status(400).send('Location name is required.');
    }

    try {
        await client.query('INSERT INTO locations (location_name) VALUES ($1) ON CONFLICT (location_name) DO NOTHING', [location_name]);
        res.send('Location added successfully.');
    } catch (err) {
        console.error('Error adding location:', err.message);
        res.status(500).send('Error adding location.');
    }
});

// Function to create a new wallet address
async function createWalletAddress(user_id) {
    try {
        const response = await axios.post('https://coinremitter.com/api/v3/LTC/get-new-address', {
            api_key: '$2b$10$ZpskXdVsknpQzMrX5qAZTujyedQaz0Dxo1DQqlHi6sxoF5eUTJMZK',
            password: 'test2023',
            label: user_id
        });

        if (response.data.flag === 1) {
            const newAddress = response.data.data.address;
            return newAddress;
        } else {
            throw new Error('Failed to create wallet address');
        }
    } catch (error) {
        console.error('Error creating wallet address:', error.message);
        throw error;
    }
}


app.post('/api/place-order', (req, res) => {
    const { deliveryAddress, deliveryLocation, quantity, quantityUnit, contactInfo } = req.body;

    // Prepare message content
    const message = `
        New Order Details:
        - Delivery Address: ${deliveryAddress}
        - Delivery Location: ${deliveryLocation}
        - Quantity: ${quantity} ${quantityUnit}
        - Contact Info: ${contactInfo}
    `;

    // Send message via Telegram bot
    axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: '1903358250',
        text: message,
        parse_mode: 'Markdown' // Optional: Use Markdown for formatting
    })
    .then(response => {
        console.log('Message sent:', response.data);
        res.json({ success: true, message: 'Order placed successfully.' });
    })
    .catch(error => {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, message: 'Error sending message.' });
    });
});


// Route to add or remove admin users
app.post('/admins', async (req, res) => {
    const { action, user_id } = req.body;
    console.log(action, user_id);
    if (!action || !user_id) {
        return res.status(400).send('Action and user ID are required.');
    }

    try {
        if (action === 'add') {
            // Add admin user
            await client.query('INSERT INTO admin_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user_id]);
            res.send('Admin user added successfully.');
        } else if (action === 'remove') {
            // Remove admin user
            const result = await client.query('DELETE FROM admin_users WHERE user_id = $1 RETURNING *', [user_id]);

            if (result.rowCount > 0) {
                res.send('Admin user removed successfully.');
            } else {
                res.status(404).send('Admin user not found.');
            }
        } else {
            res.status(400).send('Invalid action. Use "add" or "remove".');
        }
    } catch (err) {
        console.error('Error handling admin user request:', err.message);
        res.status(500).send('Internal server error.');
    }
});

// Route to list admin users
app.get('/admins', async (req, res) => {
    try {
        const result = await client.query('SELECT user_id FROM admin_users');  // Adjust query based on your database schema
        const admins = result.rows.map(row => row.user_id);
        res.json(admins);
    } catch (err) {
        console.error('Error fetching admins:', err.message);
        res.status(500).send('Error fetching admins.');
    }
});
// Route to handle uploading product images and location images
app.post('/upload-product', upload.fields([{ name: 'productImage' }, { name: 'locationImage' }]), async (req, res) => {
    const { weight, price, name, categorie, identifier } = req.body;
    const productImage = req.files['productImage'] ? req.files['productImage'][0].buffer : null;
    const locationImage = req.files['locationImage'] ? req.files['locationImage'][0].buffer : null;

    if (!productImage ) {
        return res.status(400).send('Both images are required.');
    }

    try {
        // Compress images using sharp
        const compressedProductImage = await sharp(productImage)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        const compressedLocationImage = await sharp(locationImage)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        await client.query(`
            INSERT INTO products (weight, price, name, categorie, identifier, product_image, location_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [weight, price, name, categorie, identifier, compressedProductImage, compressedLocationImage]);

        res.send('Product successfully uploaded.');
    } catch (err) {
        console.error('Error processing or inserting data:', err.message);
        res.status(500).send('Error saving product.');
    }
});


app.get('/api/products', async (req, res) => {
    console.log('Received request for products');

    // Get query parameters
    const categorie = req.query.categorie || '';

    // Construct SQL query
    let query = 'SELECT * FROM products WHERE categorie = $1';
    const queryParams = [categorie];  // Start with the categorie parameter

    // Log query for debugging
    console.log('Executing query:', query);
    console.log('Query parameters:', queryParams);

    try {
        // Execute the SQL query
        const result = await client.query(query, queryParams);
        
        // Retrieve rows from the query result
        let rows = result.rows;

        // Log the number of rows retrieved
        console.log('Query executed successfully. Number of rows retrieved:', rows.length);

        // Log the raw rows data
        console.log('Raw rows data:', rows);

        // Convert BLOB image data to Base64
        rows = rows.map(row => {
            if (row.product_image) {
                row.product_image = `data:image/png;base64,${Buffer.from(row.product_image).toString('base64')}`;
            } else if (row.location_image) { 

                row.location_image = `data:image/png;base64,${Buffer.from(row.location_image).toString('base64')}`;

            }
                
                else {
                row.product_image = ''; // or null
                console.log('Product image data is missing for row:', row);
            }
            return row;
        });

        // Send response
        res.json({ products: rows });
    } catch (err) {
        console.error('Error retrieving products:', err.message);
        res.status(500).send('Error retrieving products.');
    }
});



// Route to check if a user exists and create a wallet if not
app.post('/api/check-user', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).send('User ID is required.');
    }

    try {
        const result = await client.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        const row = result.rows[0];

        if (row) {
            res.json({ exists: true, walletAddress: row.wallet_address });
        } else {
            try {
                const walletAddress = await createWalletAddress(user_id);

                await client.query('INSERT INTO users (user_id, wallet_address) VALUES ($1, $2)', [user_id, walletAddress]);

                res.json({ exists: false, walletAddress });
            } catch (error) {
                console.error('Error creating wallet address:', error.message);
                res.status(500).send('Error creating wallet address.');
            }
        }
    } catch (error) {
        console.error('Error handling request:', error.message);
        res.status(500).send('Internal server error.');
    }
});

// Route to handle form submissions
app.post('/submit-product', upload.fields([{ name: 'image' }, { name: 'locationimage' }]), async (req, res) => {
    const { latitude, longitude, weight, price, name, type, location, identifier } = req.body;
    const product_image = req.files['image'][0]?.buffer;
    const location_image = req.files['locationimage'][0]?.buffer;

    if (!product_image || !location_image) {
        return res.status(400).send('Both images are required.');
    }

    try {
        // Compress images using sharp
        const compressedProductImage = await sharp(product_image)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        const compressedLocationImage = await sharp(location_image)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        await client.query(`
            INSERT INTO products (latitude, longitude, weight, price, name, type, location, identifier, product_image, location_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [latitude, longitude, weight, price, name, type, location, identifier, compressedProductImage, compressedLocationImage]);

        res.send('Product successfully uploaded.');
    } catch (err) {
        console.error('Error processing or inserting data:', err.message);
        res.status(500).send('Error saving product.');
    }
});

// Route to retrieve all transactions for a user
app.post('/api/orders', async (req, res) => {
    console.log("POST /api/orders endpoint hit"); // Add this line
    const { userId } = req.body;
    
    
    if (!userId) {
        return res.status(400).send('User ID is required.');
    }

    try {
        const result = await client.query('SELECT * FROM transactions WHERE user_id = $1', [userId]);
        const rows = result.rows;

        if (rows.length > 0) {
            res.json(rows);
        } else {
            res.status(404).send('No transactions found for this user.');
        }
    } catch (err) {
        console.error('Error retrieving transactions:', err.message);
        res.status(500).send('Error retrieving transactions.');
    }
});


app.get('/api/checkActiveTransactions', async (req, res) => {
    try {
        const userId = req.query.userId; // Get userId from query parameters

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Query to select active transactions
        const query = 'SELECT * FROM orders WHERE user_id = $1';
        const values = [userId]; // Adjust based on your status column

        // Execute the query
        const result = await client.query(query, values);

        // Check if there are active transactions
        if (result.rows.length > 0) {
            // If there are active transactions, return the details of the first one
            const transaction = result.rows[0];
            res.json({
                hasActiveTransaction: true,
                transaction: {
                    id: transaction.id,
                    user_id: transaction.user_id,
                    price: transaction.price,
                    amount_in_ltc: transaction.amount_in_ltc,
                    wallet_address: transaction.wallet_address,
                    created_at: transaction.created_at,
                    status: transaction.status,
                    product_id: transaction.product_id
                }
            });
        } else {
            // If no active transactions, return false
            res.json({ hasActiveTransaction: false });
        }
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/create-transaction', async (req, res) => {
    const { user_id, price, amount_in_ltc, wallet_address, product_id } = req.body;

    // Validate input data
    if (!user_id || !price || !amount_in_ltc || !wallet_address || !product_id) {
        return res.status(400).send('All fields are required.');
    }

    // Convert input data to correct types
    const userIdInt = parseInt(user_id, 10);
    const priceFloat = parseFloat(price);
    const amountInLtcFloat = parseFloat(amount_in_ltc);

    try {
        // Check for existing transaction with the same user_id and product_id
        const checkQuery = `
            SELECT COUNT(*) AS count
            FROM orders
            WHERE user_id = $1
              AND product_id = $2
        `;

        const checkResult = await client.query(checkQuery, [userIdInt, product_id]);
        const count = parseInt(checkResult.rows[0].count, 10);

        if (count > 0) {
            // Existing transaction found, do nothing
            console.log('Duplicate transaction detected, no new record created.');
            return res.status(200).send('Duplicate transaction detected, no new record created.');
        }

        // Insert new transaction into the database
        const insertQuery = `
            INSERT INTO orders (user_id, price, amount_in_ltc, wallet_address, status, product_id)
            VALUES ($1, $2, $3, $4, 'pending', $5)
        `;

        await client.query(insertQuery, [userIdInt, priceFloat, amountInLtcFloat, wallet_address, product_id]);

        res.status(200).send('Transaction created successfully.');
    } catch (err) {
        console.error('Error creating transaction:', err.message);
        res.status(500).send('Error creating transaction.');
    }
});








// Route to delete a transaction
app.post('/api/deleteTransaction', async (req, res) => {
    const { productId, userId } = req.body;

    console.log('Received delete request:', { productId, userId }); // Log incoming request

    if (!productId || !userId) {
        console.log('Product ID or User ID missing');
        return res.status(400).send('Product ID and User ID are required.');
    }

    try {
        const result = await client.query(
            'DELETE FROM orders WHERE product_id = $1 AND user_id = $2 RETURNING *',
            [productId, userId]
        );

        console.log('Delete result:', result); // Log query result

        if (result.rowCount > 0) {
            res.send('Transaction deleted successfully.');
        } else {
            res.status(404).send('Transaction not found.');
        }
    } catch (err) {
        console.error('Error deleting transaction:', err.message);
        res.status(500).send('Error deleting transaction.');
    }
});


// Route to delete a product
app.delete('/product/:identifier', async (req, res) => {
    const identifier = req.params.identifier;

    try {
        const result = await client.query('DELETE FROM products WHERE identifier = $1 RETURNING *', [identifier]);

        if (result.rowCount > 0) {
            res.send('Product successfully deleted.');
        } else {
            res.status(404).send('Product not found.');
        }
    } catch (err) {
        console.error('Error deleting product:', err.message);
        res.status(500).send('Error deleting product.');
    }
});
app.get('/api/getBalance', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).send('User ID is required');
    }

    try {
        const result = await client.query('SELECT balance FROM users WHERE user_id = $1', [userId]);
        
        if (result.rows.length > 0) {
            const balance = result.rows[0].balance;
            res.json({ balance: balance });
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('Error fetching balance:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

// Route to retrieve product details
app.get('/product/:identifier', async (req, res) => {
    const identifier = req.params.identifier;

    try {
        const result = await client.query('SELECT * FROM products WHERE identifier = $1', [identifier]);
        const row = result.rows[0];

        if (row) {
            const productDetails = {
                identifier: row.identifier,
                name: row.name,
                price: row.price,
                weight: row.weight,
                type: row.type,
                latitude: row.latitude,
                longitude: row.longitude,
                location: row.location
            };
            res.json(productDetails);
        } else {
            res.status(404).send('Product not found.');
        }
    } catch (err) {
        console.error('Error retrieving product:', err.message);
        res.status(500).send('Error retrieving product.');
    }
});
app.post('/api/get-user-transactions', async (req, res) => {
    const { address, userId} = req.body;

    if (!address) {
        return res.status(400).json({ flag: 0, msg: 'Address is required.' });
    }

    try {
        const response = await axios.post('https://coinremitter.com/api/v3/LTC/get-transaction-by-address', {
            api_key: '$2b$10$ZpskXdVsknpQzMrX5qAZTujyedQaz0Dxo1DQqlHi6sxoF5eUTJMZK',
            password: 'test2023',
            address: address
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const transactions = response.data.data; // Access the 'data' array directly

        if (!Array.isArray(transactions)) {
            return res.status(500).json({ flag: 0, msg: 'Unexpected response format from API.' });
        }

        try {
            await client.query('BEGIN');

            for (const tx of transactions) {
                const { id, amount } = tx;

                const result = await client.query('SELECT id FROM transfers WHERE tx_id = $1', [id]);

                if (result.rows.length > 0) {
                    await client.query(
                        'UPDATE transfers SET amount = $1, wallet_address = $2 WHERE tx_id = $3',
                        [amount, address, id]
                    );
                } else {
                    await client.query(
                        'INSERT INTO transfers (tx_id, amount, user_id, wallet_address) VALUES ($1, $2, $3, $4)',
                        [id, amount, userId, address]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('Database error:', dbError.message);
            return res.status(500).json({ flag: 0, msg: 'Failed to sync transactions with the database.' });
        }

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching transactions:', error.message);
        res.status(500).json({ flag: 0, msg: 'Failed to fetch transactions.' });
    }
});

async function getLtcToUsdRate() {
    const apiKey = '56f6ba30-b7cc-43f8-8e86-fbf3a1803b20'; // Replace with your API key
    try {
        const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=LTC', {
            headers: { 'X-CMC_PRO_API_KEY': apiKey }
        });
        return response.data.data.LTC.quote.USD.price;
    } catch (error) {
        throw new Error('Error fetching LTC to USD rate: ' + error.message);
    }
}
app.post('/webhook', (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            res.status(400).send('Error parsing form');
            return;
        }

        const address = Array.isArray(fields.address) ? fields.address[0] : fields.address;
        const amount = Array.isArray(fields.amount) ? fields.amount[0] : fields.amount;
        const type = Array.isArray(fields.type) ? fields.type[0] : fields.type;
        const txId = Array.isArray(fields.id) ? fields.id[0] : fields.id;

        console.log('Received address:', address);
        console.log('Received amount:', amount);
        console.log('Received type:', type);
        console.log('Received tx_id:', txId);

        try {
            // Query user ID from database
            const userIdResult = await client.query(
                'SELECT user_id FROM users WHERE wallet_address = $1',
                [address]
            );

            if (userIdResult.rows.length === 0) {
                console.log('No user found with the provided address.');
                res.status(404).send('User not found');
                return;
            }

            const userId = userIdResult.rows[0].user_id;
            console.log('User ID:', userId);

            if (type === 'receive') {
                // Check if a transaction with the given tx_id exists in the transfers table
                const txCheckResult = await client.query(
                    'SELECT 1 FROM transfers WHERE tx_id = $1',
                    [txId]
                );

                if (txCheckResult.rows.length > 0) {
                    console.log('Transaction with the given tx_id already exists.');
                    res.status(400).send('Transaction already exists');
                    return;
                }

                const trimmedAddressLabel = address;
                const amountInFloat = parseFloat(amount);

                // Get LTC to USD conversion rate
                const ltcToUsdRate = await getLtcToUsdRate();
                const amountInUsd = amountInFloat * ltcToUsdRate;

                // Add the received amount to the user's balance
                await client.query(
                    'UPDATE users SET balance = balance + $1 WHERE wallet_address = $2',
                    [amountInUsd, trimmedAddressLabel]
                );
                console.log('User balance updated successfully.');

                // Record the transaction in the transfers table
                await client.query(
                    'INSERT INTO transfers (tx_id, amount, user_id, wallet_address) VALUES ($1, $2, $3, $4)',
                    [txId, amountInUsd, userId, trimmedAddressLabel]
                );
                console.log('Transaction recorded in transfers table.');

                // Check for pending orders for the user
                const ordersResult = await client.query(
                    'SELECT amount_in_ltc, product_id FROM orders WHERE wallet_address = $1',
                    [trimmedAddressLabel]
                );

                if (ordersResult.rows.length > 0) {
                    const amountInLtc = ordersResult.rows[0].amount_in_ltc;
                    const productId = ordersResult.rows[0].product_id;

                    console.log('Amount in LTC from database:', amountInLtc);

                    const acceptableDifference = 1; // $1 tolerance
                    if (amountInFloat >= amountInLtc - acceptableDifference) {
                        console.log('Transaction valid.');

                        // Deduct the amount needed for the product
                        await client.query(
                            'UPDATE users SET balance = balance - $1 WHERE wallet_address = $2',
                            [amountInLtc * ltcToUsdRate, trimmedAddressLabel]
                        );
                        console.log('User balance updated after deducting product price.');

                        // Delete the transaction from the orders table
                        await client.query('DELETE FROM orders WHERE product_id = $1 AND wallet_address = $2', [productId, trimmedAddressLabel]);
                        console.log('Transaction deleted successfully.');

                        // Delete the product from the database


                        // Fetch product information for sending to user
                        const productResult = await client.query(
                            'SELECT location_image, latitude, longitude FROM products WHERE identifier = $1',
                            [productId]
                        );

                        if (productResult.rows.length > 0) {
                            const row = productResult.rows[0];
                            const latitude = (row.latitude || '').trim();
                            const longitude = (row.longitude || '').trim();

                            if (row.location_image) {
                                // Save the image as a JPG file
                                const filePath = path.join(__dirname, 'location_image.jpg');
                                fs.writeFile(filePath, row.location_image, 'base64', (err) => {
                                    if (err) {
                                        console.error('Error saving image:', err.message);
                                        return;
                                    }
                                    console.log('Image saved successfully.');

                                    // Send the image to the user via Telegram
                                    bot.telegram.sendPhoto(userId, { source: filePath })
                                        .then(() => {
                                            console.log('Image sent successfully.');
                                            // Delete the image file after sending
                                            fs.unlink(filePath, (err) => {
                                                if (err) {
                                                    console.error('Error deleting image:', err.message);
                                                } else {
                                                    console.log('Image deleted successfully.');
                                                }
                                            });
                                        })
                                        .catch(error => {
                                            console.error('Error sending image to Telegram:', error.message);
                                        });

                                    // Send confirmation message to user
                                    bot.telegram.sendMessage(userId, `Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:\nԿոորդինատներ : ${longitude}, ${latitude} \n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                                });

                        await client.query('DELETE FROM products WHERE identifier = $1', [productId]);
                        console.log('Product deleted successfully.');
                            } else {
                                console.log('No location image found for the product.');
                                // Send a message without image if needed
                                bot.telegram.sendMessage(userId, 'Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:');

                                // Send confirmation message to user
                                bot.telegram.sendMessage(userId, `Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:\nԿոորդինատներ : ${longitude}, ${latitude} \n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                            }
                        } else {
                            console.log('No product found for the given product ID.');
                            bot.telegram.sendMessage(userId, `Ստացել ենք ձեր փոխանցումը բայց չկարողացանք հաստատել ապրանքի արկայությունը, խնդրեում ենք կապնվել օպերատորին`, { parse_mode: 'HTML' });
                        }
                    } else {
                        console.log('Transaction amount is less than required. Amount:', amountInFloat, 'Required:', amountInLtc);
                        bot.telegram.sendMessage(userId, 'Գործարքի գումարը պահանջվածից պակաս է: ');
                    }
                } else {
                    // No pending orders for the user
                    console.log('No transactions found for the user.');
                    bot.telegram.sendMessage(userId, 'Մենք չգտանք ձեր գործարքը մեր տվյալներում: ');
                }

                res.status(200).send('Webhook received');
            } else {
                console.log('Webhook type is not receive. Type:', type);
                res.status(400).send('Invalid webhook type');
            }
        } catch (error) {
            console.error('Error processing webhook:', error.message);
            res.status(500).send('Internal Server Error');
        }
    });
});




// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


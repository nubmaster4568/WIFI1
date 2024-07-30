
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

const token = '7209454605:AAHZ90zkTzriPOOUL-F_YEfZz3IaXChiHEk';

// Create a bot instance
const bot = new Telegraf(token);
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
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    product_name TEXT,
    product_price REAL,
    product_id TEXT,
    status TEXT,
    user_id TEXT,  -- Changed from 'user'
    amount_in_dash REAL,
    lat REAL,
    lng REAL
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



app.get('/api/cities', async (req, res) => {
    try {
        // Log the start of the request
        console.log('Received request for /api/cities');

        // Fetch cities from the database
        const result = await client.query('SELECT id, city_name FROM cities'); // Adjust as needed

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
    const { latitude, longitude, weight, price, name, type, location, identifier } = req.body;
    const productImage = req.files['productImage'] ? req.files['productImage'][0].buffer : null;
    const locationImage = req.files['locationImage'] ? req.files['locationImage'][0].buffer : null;

    if (!productImage || !locationImage) {
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
            INSERT INTO products (latitude, longitude, weight, price, name, type, location, identifier, product_image, location_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [latitude, longitude, weight, price, name, type, location, identifier, compressedProductImage, compressedLocationImage]);

        res.send('Product successfully uploaded.');
    } catch (err) {
        console.error('Error processing or inserting data:', err.message);
        res.status(500).send('Error saving product.');
    }
});


app.get('/api/products', async (req, res) => {
    console.log('Received request for products');

    // Get query parameters
    const location = req.query.location || '';
    const type = req.query.type || '';

    // Construct SQL query based on parameters
    let query = 'SELECT * FROM products WHERE 1=1'; // Base query
    const queryParams = [];
    
    if (location) {
        query += ' AND location = $1';
        queryParams.push(location);
    }
    if (type) {
        query += ' AND type = $2';
        queryParams.push(type);
    }

    // Log query for debugging
    console.log('Executing query:', query);

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
            } else {
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
app.post('/api/create-transaction', async (req, res) => {
    const { user_id, price, amount_in_ltc, wallet_address,productId } = req.body;
    // Validate input data
    if (!user_id || !price || !amount_in_ltc || !wallet_address || !productId) {
        return res.status(400).send('All fields are required.');
    }

    try {
        // Insert transaction into the database
        await client.query(`
            INSERT INTO orders (user_id, price, amount_in_ltc, wallet_address, status,product_id)
            VALUES ($1, $2, $3, $4, 'pending',$6)
        `, [user_id, price, amount_in_ltc, wallet_address]);

        res.status(200).send('Transaction created successfully.');
    } catch (err) {
        console.error('Error creating transaction:', err.message);
        res.status(500).send('Error creating transaction.');
    }
});



// Route to delete a transaction
app.post('/api/deleteTransaction', async (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).send('Product ID is required.');
    }

    try {
        const result = await client.query('DELETE FROM transactions WHERE product_id = $1 RETURNING *', [productId]);

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
async function getLtcToUsdRate() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'litecoin',
                vs_currencies: 'usd'
            }
        });
        return response.data.litecoin.usd;
    } catch (error) {
        console.error('Error fetching LTC to USD rate:', error.message);
        throw error;
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
        
        const getField = (field) => Array.isArray(field) ? field[0] : field;

        const address = getField(fields.address);
        const amount = getField(fields.amount);
        const type = getField(fields.type);
        const txId = getField(fields.id);

        console.log('Received address:', address);
        console.log('Received amount:', amount);
        console.log('Received type:', type);
        console.log('Received tx_id:', txId);

        if (type === 'receive') {
            try {
                const txCheckResult = await client.query('SELECT 1 FROM transfers WHERE tx_id = $1', [txId]);
                if (txCheckResult.rows.length > 0) {
                    console.log('Transaction with the given tx_id already exists.');
                    res.status(400).send('Transaction already exists');
                    return;
                }

                const trimmedAddressLabel = address;
                const amountInFloat = parseFloat(amount);

                const ltcToUsdRate = await getLtcToUsdRate();
                const amountInUsd = amountInFloat * ltcToUsdRate;

                console.log('Updating balance for address:', trimmedAddressLabel, 'Amount in USD:', amountInUsd);
                await client.query('UPDATE users SET balance = balance + $1 WHERE wallet_address = $2', [amountInUsd, trimmedAddressLabel]);

                const ordersResult = await client.query('SELECT amount_in_ltc, product_id FROM orders WHERE wallet_address = $1', [trimmedAddressLabel]);
                if (ordersResult.rows.length > 0) {
                    const amountInLtc = ordersResult.rows[0].amount_in_ltc;
                    const productId = ordersResult.rows[0].product_id;

                    console.log('Pending order found. Amount in LTC:', amountInLtc);

                    const acceptableDifference = 1;
                    if (amountInFloat >= amountInLtc - acceptableDifference) {
                        console.log('Transaction valid. Deducting product price.');

                        await client.query('UPDATE users SET balance = balance - $1 WHERE wallet_address = $2', [amountInLtc * ltcToUsdRate, trimmedAddressLabel]);
                        await client.query('DELETE FROM orders WHERE product_id = $1 AND wallet_address = $2', [productId, trimmedAddressLabel]);
                        await client.query('DELETE FROM products WHERE identifier = $1', [productId]);

                        const productResult = await client.query('SELECT location_image, latitude, longitude FROM products WHERE identifier = $1', [productId]);
                        if (productResult.rows.length > 0) {
                            const row = productResult.rows[0];
                            const latitude = (row.latitude || '').trim();
                            const longitude = (row.longitude || '').trim();

                            if (row.location_image) {
                                const filePath = path.join(__dirname, 'location_image.jpg');
                                fs.writeFile(filePath, row.location_image, 'base64', (err) => {
                                    if (err) {
                                        console.error('Error saving image:', err.message);
                                        return;
                                    }

                                    bot.telegram.sendPhoto(trimmedAddressLabel, { source: filePath })
                                        .then(() => {
                                            console.log('Image sent successfully.');
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

                                    bot.telegram.sendMessage(trimmedAddressLabel, `Your transaction is valid and has been processed successfully:\nCoordinates: ${longitude}, ${latitude}\n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                                });
                            } else {
                                bot.telegram.sendMessage(trimmedAddressLabel, 'Your transaction is valid and has been processed successfully.');
                                bot.telegram.sendMessage(trimmedAddressLabel, `Your transaction is valid and has been processed successfully:\nCoordinates: ${longitude}, ${latitude}\n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                            }
                        } else {
                            bot.telegram.sendMessage(trimmedAddressLabel, `We received your transfer but could not confirm the product. Please contact support.`, { parse_mode: 'HTML' });
                        }
                    } else {
                        bot.telegram.sendMessage(trimmedAddressLabel, 'Transaction amount is less than required.');
                    }
                } else {
                    bot.telegram.sendMessage(trimmedAddressLabel, 'No pending transactions found for your account.');
                }

                res.status(200).send('Webhook received');
            } catch (error) {
                console.error('Error processing webhook:', error.message);
                res.status(500).send('Internal Server Error');
            }
        } else {
            console.log('Webhook type is not receive. Type:', type);
            res.status(400).send('Invalid webhook type');
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Ensure your environment variables are loaded before initializing Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || !JWT_SECRET) {
    console.error("FATAL ERROR: Missing environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/* ---------------- AUTH MIDDLEWARE ---------------- */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        // Use 403 (Forbidden) if token exists but is invalid/expired
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });

        req.user = user;
        next();
    });
}

/* ---------------- REGISTER ---------------- */
app.post('/api/register', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }

    try {
        // Check for existing user first to avoid generic Supabase error codes
        const { data: existingUser } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(409).json({ message: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { error } = await supabase
            .from('users')
            .insert([{
                email,
                password: hashedPassword,
                role: role || 'staff'
            }]);

        if (error) throw error;

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error during registration', error: err.message });
    }
});

/* ---------------- LOGIN ---------------- */
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        // Security best practice: Don't specify if it's the email or password that is wrong
        if (error || !data) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, data.password);

        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: data.id, email: data.email, role: data.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ message: 'Login successful', token });
    } catch (err) {
        res.status(500).json({ message: 'Server error during login' });
    }
});

/* ---------------- PRODUCTS CRUD ---------------- */

// CREATE
app.post('/api/products', authenticateToken, async (req, res) => {
    const { name, sku, stock_quantity, price } = req.body;

    // Added data validation
    if (!name || !sku || price === undefined) {
        return res.status(400).json({ message: 'Missing product details' });
    }

    const { data, error } = await supabase
        .from('products')
        .insert([{ name, sku, stock_quantity, price }])
        .select(); // .select() returns the created record

    if (error) return res.status(500).json(error);

    res.status(201).json({ message: 'Product created', data: data[0] });
});

// GET ALL
app.get('/api/products', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('products')
        .select('*');

    if (error) return res.status(500).json(error);
    res.json(data);
});

// UPDATE
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    const { name, sku, stock_quantity, price } = req.body;

    const { error } = await supabase
        .from('products')
        .update({ name, sku, stock_quantity, price })
        .eq('id', req.params.id);

    if (error) return res.status(500).json(error);
    res.json({ message: 'Product updated' });
});

// DELETE
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json(error);
    res.json({ message: 'Product deleted' });
});

/* ---------------- SERVER ---------------- */
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first'); // ADD THIS LINE!
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
    if (!token) return res.status(401).json({ message: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

/* ---------------- REGISTER ---------------- */
app.post('/api/register', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    try {
        const { data: existingUser } = await supabase.from('users').select('email').eq('email', email).single();
        if (existingUser) return res.status(409).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('users').insert([{ email, password: hashedPassword, role: role || 'admin' }]);
        if (error) throw error;
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

/* ---------------- LOGIN ---------------- */
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
        if (error || !data) return res.status(401).json({ message: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, data.password);
        if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: data.id, email: data.email, role: data.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ message: 'Login successful', token });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/* ---------------- PRODUCTS ---------------- */
app.post('/api/products', authenticateToken, async (req, res) => {
    const { name, sku, stock_quantity, price } = req.body;
    const { data, error } = await supabase.from('products').insert([{ name, sku, stock_quantity, price }]).select();
    if (error) return res.status(500).json(error);
    res.status(201).json({ message: 'Product created', data: data[0] });
});

app.get('/api/products', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
    const { name, sku, stock_quantity, price } = req.body;
    const { error } = await supabase.from('products').update({ name, sku, stock_quantity, price }).eq('id', req.params.id);
    if (error) return res.status(500).json(error);
    res.json({ message: 'Product updated' });
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json(error);
    res.json({ message: 'Product deleted' });
});

/* ---------------- TRANSACTIONS ---------------- */

app.get('/api/transactions', authenticateToken, async (req, res) => {
    const fs = require('fs');
    const log = (message, data) => {
        try {
            fs.appendFileSync('debug-8dd7e0.log', JSON.stringify({ sessionId: '8dd7e0', location: 'server.js:GET /api/transactions', message, data, timestamp: Date.now(), hypothesisId: 'B', runId: 'v3' }) + '\n');
        } catch (_) {}
    };
    log('transactions GET hit', { userId: req.user?.id });

    // No .order() in Supabase — table uses transaction_date, not created_at
    let { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, products(name), users(email)');

    if (error) {
        log('join query failed, trying plain select', { code: error.code, message: error.message });
        const plain = await supabase.from('inventory_transactions').select('*');
        data = plain.data;
        error = plain.error;
        if (!error && data?.length) {
            const [{ data: prods }, { data: users }] = await Promise.all([
                supabase.from('products').select('id, name'),
                supabase.from('users').select('id, email'),
            ]);
            const prodMap = Object.fromEntries((prods || []).map(p => [p.id, p.name]));
            const userMap = Object.fromEntries((users || []).map(u => [u.id, u.email]));
            data = data.map(t => ({
                ...t,
                products: prodMap[t.product_id] ? { name: prodMap[t.product_id] } : null,
                users: userMap[t.user_id] ? { email: userMap[t.user_id] } : null,
            }));
        }
    }

    if (error) {
        log('supabase error', { code: error.code, message: error.message });
        return res.status(500).json(error);
    }

    const sorted = sortTransactions(data);
    log('supabase ok', { count: sorted.length });
    res.json(sorted);
});
// #endregion
// RECORD A NEW TRANSACTION (WITH BUG TRACKER)
app.post('/api/transactions', authenticateToken, async (req, res) => {
    console.log("--> 📡 Frontend sent a new transaction request...");
    const { product_id, action_type, quantity } = req.body;
    
    const { data, error } = await supabase
        .from('inventory_transactions')
        .insert([{ product_id, user_id: req.user.id, action_type, quantity }]);

    if (error) {
        console.log("\n❌ 🛑 DATABASE REJECTED THE LOG! Here is the exact reason:");
        console.log(error);
        console.log("---------------------------------------------------\n");
        return res.status(500).json(error);
    }
    
    console.log("✅ 💾 Success! Transaction permanently saved to Supabase.\n");
    res.status(201).json({ message: 'Transaction recorded' });
});
/* ---------------- SERVER BOOT ---------------- */
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Transactions GET: v3 (no created_at — uses transaction_date in memory)');
});
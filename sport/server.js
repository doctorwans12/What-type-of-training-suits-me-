require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

// --- 1. STRIPE CONFIGURATION ---
const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripe = require('stripe')(stripeKey);

const app = express();
app.use(express.static(__dirname));

// --- 2. 100-WEEK WORKOUT GENERATOR ---
const types = ["Strength", "Cardio", "Mobility", "Endurance"];
const exercises = [
    ["Squats", "Push-ups", "Deadlifts", "Military Press"],
    ["Burpees", "Mountain Climbers", "Jump Rope", "Sprints"],
    ["Sun Salutation", "Pigeon Pose", "Stretching", "Hip Mobility"],
    ["5km Run", "Cycling", "Swimming", "Weighted Walk"]
];

const weeklyPlans = Array.from({ length: 100 }, (_, i) => {
    const typeIndex = i % types.length;
    const exIndex = i % exercises[typeIndex].length;
    return `Week ${i + 1} - ${types[typeIndex]} Focus: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. Sets: 4x12.`;
});

// --- 3. EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // 16-character App Password
    }
});

// --- 4. ROUTES ---

// Redirect to Landing Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Payment
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'Workout-Plan';
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("Stripe Error:", err.message);
        res.status(500).send("Payment system error.");
    }
});

// Success Page with Result & Auto-Redirect
app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const planName = req.query.plan;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const userEmail = session.customer_details.email;

        // Welcome Email
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: `Welcome! Your ${planName} Plan is Ready`,
            
        });

        // Display Result and Redirect back to site after 5 seconds
        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif;">
                <h1 style="color: #28a745;">Payment Successful! ✔️</h1>
                <p>Plan <strong>${planName}</strong> active for <strong>${userEmail}</strong>.</p>
                <p>Redirecting you back to the main site in 5 seconds...</p>
                <script>
                    setTimeout(function(){ window.location.href = "/"; }, 5000);
                </script>
            </div>
        `);
    } catch (err) {
        res.redirect("/");
    }
});

// Weekly Email Route (Triggered by Cron Job) - Optimized for SPAM
app.get('/send-weekly', async (req, res) => {
    if (req.query.secret !== "SECRET123") return res.status(403).send("Unauthorized");
    
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const weekIndex = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
    const plan = weeklyPlans[weekIndex % 100];

    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // Replace with subscriber list
            subject: `Weekly Update - ${weekIndex}`,
            text: plan,
            // Low priority and bulk headers to force Spam/Promotions tab
            headers: {
                "Precedence": "bulk",
                "X-Priority": "5",
                "List-Unsubscribe": "<mailto:unsub@yoursite.com>"
            }
        });
        res.send(`Sent: ${plan}`);
    } catch (err) {
        res.status(500).send("Email failed.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server fully operational on port ${PORT}`);
    console.log(`Status: ${stripeKey.startsWith('sk_test') ? "TEST MODE" : "KEY ERROR"}`);
});

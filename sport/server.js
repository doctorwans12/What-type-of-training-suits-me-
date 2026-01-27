require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

// --- 1. STRIPE TEST CONFIGURATION ---
// Ensure your Render Environment Variable 'STRIPE_SECRET_KEY' starts with 'sk_test_'
const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripe = require('stripe')(stripeKey);

const app = express();

// Serving static files (HTML, CSS, images) from the current directory
app.use(express.static(__dirname));

// --- 2. 100-WEEK PLAN GENERATOR (English) ---
const types = ["Strength", "Cardio", "Mobility", "Endurance"];
const exercises = [
    ["Squats", "Push-ups", "Deadlifts", "Military Press"],
    ["Burpees", "Mountain Climbers", "Jump Rope", "Sprints"],
    ["Sun Salutation", "Pigeon Pose", "Basic Stretching", "Hip Mobility"],
    ["5km Run", "Cycling", "Swimming", "Weighted Walk"]
];

const weeklyPlans = Array.from({ length: 100 }, (_, i) => {
    const typeIndex = i % types.length;
    const exIndex = i % exercises[typeIndex].length;
    return `Week ${i + 1} - ${types[typeIndex]} Focus: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. Perform 4 sets of 12 reps. Keep it up!`;
});

// --- 3. EMAIL SYSTEM (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // 16-character Google App Password
    }
});

// --- 4. ROUTES ---

// Main Landing Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create Test Payment Session
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'Workout-Plan';
    
    // These Price IDs must be from your Stripe Test Mode
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
        console.error("STRIPE TEST ERROR:", err.message);
        res.status(500).send(`Test Mode Error: ${err.message}. Check your sk_test key.`);
    }
});

// Success Page + Confirmation Email
app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const planName = req.query.plan;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const userEmail = session.customer_details.email;

        // Send confirmation email
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: `Welcome! Your ${planName} Plan is Active`,
            text: `Hi! Your test payment was successful. You will receive a new workout plan every Monday at this email address.`
        });

        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif; padding: 20px;">
                <h1 style="color: #28a745; font-size: 32px;">TEST Success! ✔️</h1>
                <p style="font-size: 18px;">Plan <strong>${planName}</strong> is active for <strong>${userEmail}</strong>.</p>
                <p>A test confirmation email has been sent to your inbox.</p>
                <br>
                <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Back to Site</a>
            </div>
        `);
    } catch (err) {
        res.send("Payment confirmed in test mode. Check your logs for email status.");
    }
});

// Weekly Email Trigger (Secret URL for Cron Job)
app.get('/send-weekly', async (req, res) => {
    if (req.query.secret !== "SECRET123") return res.status(403).send("Unauthorized");
    
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const weekIndex = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
    
    const plan = weeklyPlans[weekIndex % 100];
    res.send(`Weekly content for week ${weekIndex}: ${plan}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`--- SERVER RUNNING IN TEST MODE ON PORT ${PORT} ---`);
    console.log(`Key check: ${stripeKey.startsWith('sk_test') ? "OK (TEST)" : "ERROR (NOT TEST KEY)"}`);
});



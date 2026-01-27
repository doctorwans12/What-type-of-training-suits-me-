require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

// --- 1. STRIPE TEST CONFIGURATION ---
// Ensure STRIPE_SECRET_KEY in Render starts with 'sk_test_'
const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripe = require('stripe')(stripeKey);

const app = express();

// Serves static files (HTML, CSS, JS) from the root folder
app.use(express.static(__dirname));

// --- 2. 100-WEEK PLAN GENERATOR ---
// This logic creates 100 weeks of rotating content automatically
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
    return `Week ${i + 1} - ${types[typeIndex]} Focus: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. 4 sets of 12 reps.`;
});

// --- 3. EMAIL SYSTEM (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Must be the 16-character Google App Password
    }
});

// --- 4. ROUTES ---

// Main Landing Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create Stripe Checkout Session
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
        console.error("STRIPE ERROR:", err.message);
        res.status(500).send(`Stripe Error: ${err.message}. Please check your sk_test key in Render.`);
    }
});

// Success Page & Automatic Email
app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const planName = req.query.plan;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const userEmail = session.customer_details.email;

        // Send welcome email immediately
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: `Welcome! Your ${planName} Plan is Active`,
            text: `Hi! Your test payment was successful. You will receive a new workout plan every Monday at this email address.`
        });

        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif;">
                <h1 style="color: #28a745; font-size: 35px;">Payment Successful! ✔️</h1>
                <p style="font-size: 20px;">The <strong>${planName}</strong> plan is now active for <strong>${userEmail}</strong>.</p>
                <p>Check your email for your first workout session.</p>
                <br>
                <a href="/" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Return to Site</a>
            </div>
        `);
    } catch (err) {
        console.error("SUCCESS ROUTE ERROR:", err.message);
        res.send("Payment confirmed. Check your email for details.");
    }
});

// Automation Route for Weekly Emails
app.get('/send-weekly', async (req, res) => {
    if (req.query.secret !== "SECRET123") return res.status(403).send("Unauthorized");
    
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const weekIndex = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
    
    const plan = weeklyPlans[weekIndex % 100];
    res.send(`Weekly content generated for week ${weekIndex}: ${plan}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    // Diagnostic log to catch the error from your screenshot
    console.log(`✅ Key Status: ${stripeKey.startsWith('sk_test') ? "LOADED (TEST)" : "MISSING/WRONG KEY"}`);
});

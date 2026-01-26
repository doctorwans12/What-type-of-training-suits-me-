require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

// --- STRIPE LIVE CHECK ---
// We use a fallback to make sure the key is trimmed of any accidental spaces
const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();

if (!stripeKey || !stripeKey.startsWith('sk_live')) {
    console.error("❌ ERROR: STRIPE_SECRET_KEY is missing or NOT a Live Key (sk_live_...)!");
} else {
    console.log("✅ STRIPE STATUS: Live Key Detected and Loaded.");
}

const stripe = require('stripe')(stripeKey);
const app = express();

// 1. STATICS
app.use(express.static(__dirname));

// 2. 100-WEEK PLAN GENERATOR
const types = ["Strength", "Cardio/HIIT", "Mobility/Yoga", "Endurance"];
const exercises = [
    ["Squats", "Push-ups", "Deadlifts", "Military Press"],
    ["Burpees", "Mountain Climbers", "Jump Rope", "Sprints"],
    ["Sun Salutation", "Pigeon Pose", "Basic Stretching", "Hip Mobility"],
    ["5km Run", "45 min Cycling", "Swimming", "Rucking/Weighted Walk"]
];

const weeklyPlans = Array.from({ length: 100 }, (_, i) => {
    const typeIndex = i % types.length;
    const exIndex = i % exercises[typeIndex].length;
    return `Week ${i + 1} - Focus: ${types[typeIndex]}. \nWorkout: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. \nSets: 4 sets x 12 reps.`;
});

// 3. EMAIL (GMAIL)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // 16-character App Password
    }
});

// 4. ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'Workout-Plan';
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    if (!stripeKey.startsWith('sk_live')) {
        return res.status(500).send("Configuration Error: Live Key is not set correctly in Render.");
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: selectedPrice, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("STRIPE LIVE ERROR:", err.message);
        res.status(500).send("Payment Gateway Error: " + err.message);
    }
});

app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const chosenPlan = req.query.plan;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customerEmail = session.customer_details.email;

        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: customerEmail,
            subject: `Welcome! Your ${chosenPlan} plan is active`,
            text: `Hi! Your payment was successful. You will receive your weekly training here every Monday.`
        });

        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif;">
                <h1 style="color: #28a745;">Success!</h1>
                <p>Plan <strong>${chosenPlan}</strong> activated for <strong>${customerEmail}</strong></p>
                <a href="/">Back to Site</a>
            </div>
        `);
    } catch (err) {
        res.send("Payment confirmed. Check your email for details.");
    }
});

// 5. WEEKLY TRIGGER
app.get('/send-weekly', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== "SECRET123") return res.status(403).send("Unauthorized");

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const weekOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24 * 7));
    const currentPlan = weeklyPlans[weekOfYear % weeklyPlans.length];

    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, 
            subject: `Weekly Update - Week ${weekOfYear}`,
            text: currentPlan
        });
        res.send(`Email sent for week ${weekOfYear}`);
    } catch (err) {
        res.status(500).send("Email Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Live Server running on port ${PORT}`));


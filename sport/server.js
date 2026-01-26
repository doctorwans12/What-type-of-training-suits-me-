require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

// --- 1. CRITICAL STRIPE KEY CHECK ---
// This ensures the server tells you EXACTLY if the key is missing from Render
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey || stripeKey.trim() === "") {
    console.error("❌ CRITICAL ERROR: STRIPE_SECRET_KEY is missing in Render Environment Variables!");
}
const stripe = require('stripe')(stripeKey);

const app = express();

// --- 2. FOLDER SETTINGS ---
app.use(express.static(__dirname));

// --- 3. AUTOMATIC 100-WEEK PLAN GENERATOR ---
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
    return `Week ${i + 1} - Focus: ${types[typeIndex]}. \nWorkout: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. \nSets: 4 sets x 12 reps. Keep pushing!`;
});

// --- 4. EMAIL CONFIGURATION (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // 16-character App Password from Google
    }
});

// --- 5. ROUTES ---

// Main Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Stripe Payment Session
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'Workout-Plan';
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    if (!stripeKey) {
        return res.status(500).send("Server configuration error: Stripe Key is missing in Render settings.");
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
        console.error("Stripe Error:", err.message);
        res.status(500).send("Payment Error: " + err.message);
    }
});

// Success Page + Automatic Welcome Email
app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const chosenPlan = req.query.plan;

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customerEmail = session.customer_details.email;

        // Immediate Email Delivery
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: customerEmail,
            subject: `Welcome! Your ${chosenPlan} plan is active`,
            text: `Hi! Your payment was successful. You will receive a new workout plan every Monday on this email address.`
        });

        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif; padding: 20px;">
                <h1 style="color: #28a745; font-size: 40px;">Payment Successful! ✔️</h1>
                <p style="font-size: 20px;">The <strong>${chosenPlan}</strong> plan has been activated for <strong>${customerEmail}</strong></p>
                <p>Check your inbox for your first email.</p>
                <br>
                <a href="/" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Back to Site</a>
            </div>
        `);
    } catch (err) {
        console.error("Success Route Error:", err.message);
        res.send("Payment confirmed, but we encountered an error setting up your success page.");
    }
});

// Weekly Automation Trigger (Cron Job)
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
            to: process.env.GMAIL_USER, // In production, loop through your database of customer emails
            subject: `Your Weekly Workout - Week ${weekOfYear}`,
            text: `Here is your new plan for the week:\n\n${currentPlan}`
        });
        res.send(`Email sent for week ${weekOfYear}`);
    } catch (err) {
        res.status(500).send("Email Automation Error: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Stripe Key Status: ${stripeKey ? "Detected" : "MISSING"}`);
});

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

// 1. FOLDER CONFIGURATION (Root: 'sport')
app.use(express.static(__dirname));

// 2. AUTOMATIC 100-WEEK PLAN GENERATOR
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
    return `Week ${i + 1} - Focus: ${types[typeIndex]}. 
    Today's workout: ${exercises[typeIndex][exIndex]} and ${exercises[typeIndex][(exIndex + 1) % 4]}. 
    Sets: 4 sets x 12 reps. Let's get it!`;
});

// 3. EMAIL CONFIGURATION (Uses GMAIL_USER and GMAIL_PASS from Render)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // 16-character App Password
    }
});

// 4. MAIN ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 5. STRIPE PAYMENT ROUTE (Connected to HTML buttons)
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'Workout-Plan';
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

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

// 6. SUCCESS PAGE (Shown after payment) + WELCOME EMAIL
app.get('/success', async (req, res) => {
    const sessionId = req.query.session_id;
    const chosenPlan = req.query.plan;

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customerEmail = session.customer_details.email;

        // Send immediate confirmation
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: customerEmail,
            subject: `Welcome! Your ${chosenPlan} plan is active`,
            text: `Hi! Thank you for your payment. From now on, you will receive a new workout plan every week at this email address.`
        });

        // Result displayed on page
        res.send(`
            <div style="text-align:center; margin-top:100px; font-family: sans-serif; background: #f4f4f4; padding: 50px;">
                <h1 style="color: #28a745;">Payment Successful! ✔️</h1>
                <p>Access for <strong>${chosenPlan}</strong> has been activated.</p>
                <p>A confirmation has been sent to: <strong>${customerEmail}</strong></p>
                <br>
                <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Back to Site</a>
            </div>
        `);
    } catch (err) {
        res.send("Payment confirmed, but there was an error displaying the success page.");
    }
});

// 7. AUTOMATION ROUTE (CRON JOB)
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
            to: process.env.GMAIL_USER, // In production, replace with your customer email list
            subject: `Your New Plan - Week ${weekOfYear}`,
            text: `Hi there! Here is your new content for this week:\n\n${currentPlan}`
        });
        res.send(`Weekly email sent: Week ${weekOfYear}`);
    } catch (err) {
        res.status(500).send("Email Error: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

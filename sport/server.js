require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const app = express();

// Setăm folderul curent pentru fișierele statice (imagini, css)
app.use(express.static(path.join(__dirname, '')));

// RUTA PRINCIPALĂ - Aceasta lipsea și de asta aveai eroare!
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// 2. 100 WEEKS OF TIPS
const weeklyTips = [
    "Week 1: Focus on 8 hours of sleep for optimal recovery.",
    "Week 2: Drink 500ml of water with sea salt upon waking.",
    "Week 3: Try 10 minutes of direct sunlight in the morning.",
    "Week 4: Cold shower for 2 minutes to boost dopamine."
];

// 3. STRIPE PAYMENT SESSION
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const userChoice = req.query.choice || 'general'; 
    
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: isSub ? process.env.PRICE_ID : undefined,
                price_data: !isSub ? {
                    currency: 'usd',
                    product_data: { name: 'Professional Sport Test Result' },
                    unit_amount: 100, // $1
                } : undefined,
                quantity: 1,
            }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/result?paid=true&sub=${isSub}&choice=${userChoice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        res.status(500).send("Stripe Error: " + err.message);
    }
});

// 4. RESULTS PAGE
app.get('/result', (req, res) => {
    const { paid, sub, choice } = req.query;
    if (paid !== 'true') return res.redirect('/');

    let finalSport = choice === 'power' ? "Bodybuilding" : choice === 'speed' ? "Sprinting" : "General Fitness";

    if (sub === 'true') {
        transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, 
            subject: 'Welcome to the 100-Week Biohacking Journey',
            text: `Your test result: ${finalSport}. You will receive a new tip every Saturday!`
        });
    }

    res.send(`
        <div style='text-align:center; padding-top:100px; font-family: sans-serif; background: #121212; color: white; height: 100vh;'>
            <h1>Analysis Complete!</h1>
            <h2 style="color: #27ae60;">${finalSport}</h2>
            ${sub === 'true' ? '<p>Check your email for your first tip!</p>' : ''}
            <br><a href="/" style="color: #3498db;">Back to Quiz</a>
        </div>
    `);
});

// 5. CRON JOB
cron.schedule('0 9 * * 6', () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const weekIdx = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    const tip = weeklyTips[weekIdx % weeklyTips.length];

    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: `Week ${weekIdx + 1}: Your Weekly Biohacking Tip`,
        text: tip
    });
});

// PORT CONFIGURATION - OBLIGATORIU PENTRU RENDER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

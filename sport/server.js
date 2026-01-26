
require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path'); // Adăugat pentru managementul căilor
const app = express();

// Setăm folderul curent (sport) ca sursă pentru fișierele HTML/CSS
app.use(express.static(path.join(__dirname, '')));

// 1. EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// 2. 100 WEEKS OF TIPS
const weeklyTips = [
    "Week 1: Focus on 8 hours of sleep for optimal recovery.",
    "Week 2: Drink 500ml of water with sea salt upon waking.",
    "Week 3: Try 10 minutes of direct sunlight in the morning.",
    // Adaugă restul până la 100 aici
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

    let finalSport = choice === 'power' ? "Bodybuilding

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const app = express();

app.use(express.static('public'));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    
    const items = [{
        price_data: {
            currency: 'usd',
            product_data: { name: 'Professional Sport Test Result' },
            unit_amount: 100, // 1$
        },
        quantity: 1,
    }];

    if (isSub) {
        items.push({
            price: process.env.PRICE_ID, // 2$ weekly sub
            quantity: 1,
        });
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: items,
        mode: isSub ? 'subscription' : 'payment',
        success_url: `${req.protocol}://${req.get('host')}/result?paid=true&sub=${isSub}`,
        cancel_url: `${req.protocol}://${req.get('host')}/`,
    });

    res.redirect(303, session.url);
});

app.get('/result', (req, res) => {
    const isSub = req.query.sub === 'true';
    if(isSub) {
        transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, 
            subject: 'Weekly Biohacking Update',
            text: 'Your journey starts now. Focus on hydration and sleep this week!'
        });
    }
    res.send("<div style='text-align:center; padding-top:100px;'><h1>Success! Your sport is Bodybuilding & Cardio.</h1></div>");
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));
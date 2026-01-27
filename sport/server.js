require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

// CONFIGURARE NODEMAILER - Curată pentru Inbox
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Parola de aplicatie (16 caractere)
    },
    tls: {
        rejectUnauthorized: false
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. RUTA DE PLATA
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice; 
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}&isSub=${isSub}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("Stripe Error:", err.message);
        res.status(500).send("Eroare la Stripe.");
    }
});

// 2. RUTA DE SUCCES - REPARATA COMPLET
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        if (isSub === 'true') {
            const mailOptions = {
                from: `"Personal Trainer" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Important: Your Training Results",
                text: `Hi! Thank you for choosing our program. Here is your professional roadmap. Let's get to work!`
                // Am scos headerele de bulk ca sa intre in INBOX, nu in Spam
            };

            // Trimitere asincrona (nu blocheaza redirect-ul)
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) console.log("❌ Eroare Mail:", err.message);
                else console.log("✅ Mail trimis in Inbox!");
            });
        }

        // REDIRECT INSTANT LA HTML
        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
        
    } catch (err) {
        console.error("Success Route Error:", err.message);
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server activ pe portul ${PORT}`));



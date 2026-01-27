require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// 1. RUTA PRINCIPALĂ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. RUTA DE PLATĂ (Trimite rezultatul testului către Stripe pentru a-l primi înapoi)
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice; // 'power', 'speed' sau 'stamina'
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            // DUPĂ PLATĂ, TRIMITE ÎNAPOI LA HTML CU REZULTATUL ÎN URL
            success_url: `${req.protocol}://${req.get('host')}/?session_id={CHECKOUT_SESSION_ID}&plan=${choice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        res.status(500).send("Stripe Error");
    }
});

// 3. LOGICA PENTRU CELE 100 DE EMAILURI (SĂPTĂMÂNAL)
// Această rută va fi apelată automat de un Cron Job (ex: EasyCron sau GitHub Action)
app.get('/send-weekly-bulk', async (req, res) => {
    if (req.query.secret !== "REGELE_SECRET_123") return res.status(403).send("Unauthorized");

    try {
        // Aici pui email-ul clientului (îl poți lua din baza de date sau Stripe)
        const userEmail = "client@email.com"; 
        
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: "Your Weekly Training Roadmap (SPAM)",
            text: "Aceasta este saptamana ta de antrenament profesional. Nu te opri acum!",
            // HEADERE PENTRU A FORȚA INTRAREA ÎN SPAM / PROMOTIONS
            headers: {
                "Precedence": "bulk",
                "X-Priority": "5",
                "X-Auto-Response-Suppress": "All"
            }
        });
        res.send("Email-ul săptămânal a fost trimis în Spam.");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serverul ruleaza pe portul ${PORT}`));

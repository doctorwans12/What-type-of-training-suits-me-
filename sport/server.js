require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Parola de aplicatie fara spatii
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

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
    } catch (err) { res.status(500).send("Stripe Error"); }
});

app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        if (isSub === 'true') {
            // TRIMITEM EMAIL-UL FĂRĂ "AWAIT" CA SĂ NU BLOCĂM PAGINA
            transporter.sendMail({
                from: `"Training Pro" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Your 100-Week Roadmap",
                text: "Planul tau saptamanal este aici...",
                headers: { "Precedence": "bulk", "X-Priority": "5" }
            }).catch(e => console.log("Email failed in background:", e.message));
        }

        // REDIRECT INSTANT ÎNAPOI LA SITE
        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
    } catch (err) {
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server activ pe port ${PORT}`));

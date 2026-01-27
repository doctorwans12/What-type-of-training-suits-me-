require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

// CONFIGURARE EMAIL
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// GENERATOR TEXT 100 SĂPTĂMÂNI
const trainingPlan = Array.from({ length: 100 }, (_, i) => `Week ${i + 1}: Professional training drill #${i + 101}. Focus on progressive overload.`).join('\n');

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. RUTA DE PLATĂ
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice; 
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            // Trimitem isSub și choice către ruta de success
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}&isSub=${isSub}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        res.status(500).send("Stripe Error");
    }
});

// 2. RUTA DE SUCCESS (Trimite emailul și dă REDIRECT înapoi la HTML)
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        // Trimitem emailul lung DOAR dacă a ales abonamentul (isSub === true)
        if (isSub === 'true') {
            await transporter.sendMail({
                from: `"Professional Roadmap" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Your 100-Week Training Roadmap",
                text: `Felicitări! Iată planul tău pe 100 de săptămâni:\n\n${trainingPlan}`,
                headers: {
                    "Precedence": "bulk",
                    "X-Priority": "5" // Forțează intrarea în SPAM
                }
            });
            console.log("Email abonament trimis.");
        }

        // REDIRECT ÎNAPOI LA PAGINA PRINCIPALĂ CU DATELE PENTRU AFIȘARE
        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
    } catch (err) {
        console.error("Error in success route:", err);
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server activ pe portul ${PORT}`));

require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

// CONFIGURARE NODEMAILER - Testată pentru Render/Gmail
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Aici pui parola de aplicatie de 16 caractere
    },
    tls: {
        rejectUnauthorized: false // Ajută să nu se blocheze pe serverele Render
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
        res.status(500).send("Eroare la plata.");
    }
});

app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        // TRIMITE EMAIL DOAR DACĂ E ABONAMENT
        if (isSub === 'true') {
            const mailOptions = {
                from: `"Training Pro" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Your 100-Week Training Roadmap",
                text: "Felicitari! Planul tau profesional pe 100 de saptamani a fost activat.",
                headers: {
                    "Precedence": "bulk",
                    "X-Priority": "5"
                }
            };

            // FOARTE IMPORTANT: Nu punem 'await' aici. 
            // Trimiterea pleacă în fundal, iar serverul execută imediat redirect-ul de mai jos.
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log("❌ Email Error in background:", error.message);
                } else {
                    console.log("✅ Email sent successfully:", info.response);
                }
            });
        }

        // REDIRECT INSTANTĂ ÎNAPOI LA SITE
        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
        
    } catch (err) {
        console.error("Success Route Error:", err.message);
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server activ pe portul ${PORT}`));

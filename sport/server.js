require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static(__dirname));

// --- CONFIGURARE EMAIL (GMAIL) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Parola de aplicație de 16 caractere
    }
});

// LOGICA CELOR 100 DE SĂPTĂMÂNI
const trainingPlan = Array.from({ length: 100 }, (_, i) => `Săptămâna ${i + 1}: Antrenament intens focusat pe progres.`).join('\n');

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// RUTA DE PLATĂ
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice;
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            // Trimitem isSub în URL-ul de succes pentru a ști dacă trimitem email-ul lung
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}&isSub=${isSub}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) { res.status(500).send("Eroare Stripe."); }
});

// RUTA DE SUCCES (Aici se decide trimiterea email-ului)
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        // VERIFICARE: Trimitem email-ul DOAR dacă este abonament (isSub === 'true')
        if (isSub === 'true') {
            await transporter.sendMail({
                from: `"Professional Roadmap" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: `Your 100-Week ${plan.toUpperCase()} Roadmap`,
                text: `Felicitări pentru abonament! Iată planul tău pe 100 de săptămâni:\n\n${trainingPlan}`,
                headers: {
                    "Precedence": "bulk",
                    "X-Priority": "5" // Forțăm SPAM
                }
            });
            console.log(`✅ Email abonament trimis către ${customerEmail}`);
        } else {
            console.log(`ℹ️ Plată unică pentru ${customerEmail}. Nu s-a trimis planul de 100 săptămâni.`);
        }

        // Redirect înapoi la index.html pentru a afișa rezultatul pe ecran
        res.redirect(`/?session_id=${session_id}&plan=${plan}`);
    } catch (err) {
        console.error("Eroare:", err.message);
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server activ pe portul ${PORT}`));

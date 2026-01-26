require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

// Middleware pentru fișiere statice
app.use(express.static(__dirname));

// RUTA PRINCIPALĂ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// SESIUNE PLATĂ STRIPE - DOAR PENTRU LIVE
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const userChoice = req.query.choice || 'general'; 
    
    // Selectează ID-ul corect salvat în Render (Environment Variables)
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    if (!selectedPrice || !selectedPrice.startsWith('price_')) {
        return res.status(500).send("Eroare: ID-ul de pret (PRICE_ID) este invalid sau lipseste din Render!");
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: selectedPrice,
                quantity: 1,
            }],
            mode: isSub ? 'subscription' : 'payment',
            // Dinamizează URL-ul pentru a funcționa pe Render HTTPS
            success_url: `https://${req.get('host')}/result?paid=true&sub=${isSub}&choice=${userChoice}`,
            cancel_url: `https://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("EROARE STRIPE LIVE:", err.message);
        res.status(500).send("Eroare Stripe: " + err.message);
    }
});

// PAGINA REZULTATE ȘI TRIMITERE EMAIL
app.get('/result', (req, res) => {
    const { paid, sub, choice } = req.query;
    if (paid !== 'true') return res.redirect('/');

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { 
            user: process.env.GMAIL_USER, 
            pass: process.env.GMAIL_PASS 
        }
    });

    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: 'Plată Live Confirmată!',
        text: `Sport: ${choice} | Tip: ${sub === 'true' ? 'Abonament' : 'Plată Unică'}`
    });

    res.send(`
        <div style="text-align:center; padding-top:100px; font-family:sans-serif; background:#121212; color:white; height:100vh;">
            <h1 style="color:#27ae60;">Analiza Completă (LIVE)</h1>
            <h2>Rezultat: ${choice}</h2>
            <p>Mulțumim! Verifică email-ul pentru detalii.</p>
            <br><a href="/" style="color:#3498db; text-decoration:none;">Înapoi la site</a>
        </div>
    `);
});

// CONFIGURARE PORT RENDER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server LIVE activ pe portul ${PORT}`));

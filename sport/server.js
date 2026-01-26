require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const app = express();

// Setăm folderul curent ca sursă pentru fișierele statice
app.use(express.static(__dirname));

// RUTA PRINCIPALĂ - Rezolvă eroarea "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. CONFIGURARE EMAIL (Folosind datele tale din Render)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// 2. LOGICA DE PLATĂ STRIPE (Abonament vs Plată Unică)
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const userChoice = req.query.choice || 'general'; 
    
    // Selectăm ID-ul corect din Environment Variables (Render)
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: selectedPrice,
                quantity: 1,
            }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/result?paid=true&sub=${isSub}&choice=${userChoice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("Stripe Error:", err.message);
        res.status(500).send("Eroare Stripe: " + err.message);
    }
});

// 3. PAGINA DE REZULTATE
app.get('/result', (req, res) => {
    const { paid, sub, choice } = req.query;
    if (paid !== 'true') return res.redirect('/');
    
    let finalSport = choice === 'power' ? "Bodybuilding" : choice === 'speed' ? "Sprinting" : "General Fitness";

    // Trimite email de notificare către tine
    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: 'Vânzare Nouă - Biohacking Quiz',
        text: `Rezultat: ${finalSport} | Tip: ${sub === 'true' ? 'Abonament' : 'Plată Unică'}`
    });

    res.send(`
        <div style="text-align:center; padding-top:100px; font-family:sans-serif; background:#121212; color:white; height:100vh;">
            <h1 style="color:#27ae60;">Plată Confirmată!</h1>
            <h2>Rezultatul tău: ${finalSport}</h2>
            <p>${sub === 'true' ? 'Te-ai abonat! Verifică email-ul pentru sfaturi.' : 'Mulțumim pentru achiziție!'}</p>
            <br><a href="/" style="color:#3498db; text-decoration:none; border:1px solid #3498db; padding:10px;">Înapoi la site</a>
        </div>
    `);
});

// 4. PORTUL PENTRU RENDER (MODIFICATĂ)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server activ pe portul ${PORT}`));

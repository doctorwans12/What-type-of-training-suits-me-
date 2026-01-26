require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const app = express();

// Servește fișierele din folderul curent (index.html, imagini, etc.)
app.use(express.static(__dirname));

// RUTA PRINCIPALĂ: Aceasta elimină eroarea "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. CONFIGURARE EMAIL
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// 2. SFATURI BIOHACKING (Exemple)
const weeklyTips = [
    "Week 1: Focus on 8 hours of sleep for optimal recovery.",
    "Week 2: Drink 500ml of water with sea salt upon waking.",
    "Week 3: Try 10 minutes of direct sunlight in the morning.",
    "Week 4: Cold shower for 2 minutes to boost dopamine."
];

// 3. LOGICA DE PLATĂ STRIPE (Double ID)
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const userChoice = req.query.choice || 'general'; 
    
    // Selectăm ID-ul corect din Environment Variables de pe Render
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
        res.status(500).send("Eroare la procesarea plății: " + err.message);
    }
});

// 4. PAGINA DE REZULTATE DUPĂ PLATĂ
app.get('/result', (req, res) => {
    const { paid, sub, choice } = req.query;
    if (paid !== 'true') return res.redirect('/');

    let finalSport = choice === 'power' ? "Bodybuilding" : choice === 'speed' ? "Sprinting" : "General Fitness";

    // Trimitere email de confirmare
    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: 'Tranzacție Nouă - Biohacking Quiz',
        text: `Rezultat: ${finalSport} | Tip: ${sub === 'true' ? 'Abonament' : 'Plată Unică'}`
    });

    res.send(`
        <div style='text-align:center; padding-top:100px; font-family: sans-serif; background: #121212; color: white; height: 100vh;'>
            <h1 style="color: #27ae60;">Analiza Completă!</h1>
            <h2>Sport Recomandat: ${finalSport}</h2>
            <p>${sub === 'true' ? 'Te-ai abonat cu succes! Vei primi sfaturi săptămânale.' : 'Mulțumim pentru achiziție!'}</p>
            <br><a href="/" style="color: #3498db; text-decoration: none; border: 1px solid #3498db; padding: 10px; border-radius: 5px;">Înapoi la site</a>
        </div>
    `);
});

// 5. CRON JOB (Trimitere sfat în fiecare sâmbătă la 09:00)
cron.schedule('0 9 * * 6', () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const weekIdx = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    const tip = weeklyTips[weekIdx % weeklyTips.length];

    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: `Week ${weekIdx + 1}: Sfatul tău de Biohacking`,
        text: tip
    });
});

// PORTUL DAT DE RENDER (Obligatoriu)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server activ pe portul ${PORT}`));

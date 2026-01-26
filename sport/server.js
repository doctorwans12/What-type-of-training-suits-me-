require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const app = express();

// Setări pentru fișierele statice (imagini, css, js)
// Folosim path.join ca să fim siguri că găsește folderul indiferent de unde e rulat
app.use(express.static(path.join(__dirname)));

// RUTA PRINCIPALĂ - Aici trimitem index.html când cineva accesează link-ul
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

// 2. SFATURI BIOHACKING (100 SĂPTĂMÂNI)
const weeklyTips = [
    "Săptămâna 1: Concentrează-te pe 8 ore de somn pentru recuperare optimă.",
    "Săptămâna 2: Bea 500ml de apă cu sare de mare imediat după trezire.",
    "Săptămâna 3: Încearcă 10 minute de expunere directă la soare dimineața.",
    "Săptămâna 4: Duș rece timp de 2 minute pentru a crește nivelul de dopamină."
];

// 3. SESIUNE PLATĂ STRIPE
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const userChoice = req.query.choice || 'general'; 
    
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: isSub ? process.env.PRICE_ID : undefined,
                price_data: !isSub ? {
                    currency: 'usd',
                    product_data: { name: 'Professional Sport Test Result' },
                    unit_amount: 100, // 1.00 USD
                } : undefined,
                quantity: 1,
            }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `${req.protocol}://${req.get('host')}/result?paid=true&sub=${isSub}&choice=${userChoice}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        res.status(500).send("Eroare Stripe: " + err.message);
    }
});

// 4. PAGINA DE REZULTATE
app.get('/result', (req, res) => {
    const { paid, sub, choice } = req.query;
    if (paid !== 'true') return res.redirect('/');

    let finalSport = choice === 'power' ? "Bodybuilding" : choice === 'speed' ? "Sprinting" : "General Fitness";

    if (sub === 'true') {
        transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // În producție, folosește email-ul clientului
            subject: 'Bun venit în călătoria de 100 de săptămâni de Biohacking',
            text: `Rezultatul testului tău: ${finalSport}. Vei primi un sfat nou în fiecare sâmbătă!`
        });
    }

    res.send(`
        <div style='text-align:center; padding-top:100px; font-family: sans-serif; background: #121212; color: white; height: 100vh;'>
            <h1>Analiza a fost finalizată!</h1>
            <h2 style="color: #27ae60;">Sport recomandat: ${finalSport}</h2>
            ${sub === 'true' ? '<p>Verifică-ți email-ul pentru primul sfat!</p>' : '<p>Îți mulțumim pentru achiziție!</p>'}
            <br><a href="/" style="color: #3498db; text-decoration: none; border: 1px solid #3498db; padding: 10px; border-radius: 5px;">Înapoi la Quiz</a>
        </div>
    `);
});

// 5. CRON JOB - TRIMITE SFATURI ÎN FIECARE SÂMBĂTĂ LA 9 DIMINEAȚA
cron.schedule('0 9 * * 6', () => {
    console.log('Se trimit sfaturile săptămânale...');
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const weekIdx = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    const tip = weeklyTips[weekIdx % weeklyTips.length];

    transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER, 
        subject: `Săptămâna ${weekIdx + 1}: Sfatul tău de Biohacking`,
        text: tip
    });
});

// CONFIGURARE PORT PENTRU RENDER (OBLIGATORIU)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serverul rulează pe portul ${PORT}`);
});

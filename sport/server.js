require('dotenv').config();
const express = require('express');
// Aici este linia care iti lipsea sau era gresita:
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const app = express();

// Serveste fisierele statice din folderul curent (index.html, css, etc.)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta pentru crearea sesiunii de plata
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice || 'general';
    
    // Foloseste ID-urile de pret din variabilele de mediu Render
    const selectedPrice = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: selectedPrice,
                quantity: 1,
            }],
            mode: isSub ? 'subscription' : 'payment',
            success_url: `https://${req.get('host')}/result?paid=true&choice=${choice}`,
            cancel_url: `https://${req.get('host')}/`,
        });

        // Redirect catre pagina de plata Stripe
        res.redirect(303, session.url);
    } catch (err) {
        console.error("EROARE STRIPE:", err.message);
        res.status(500).send("Eroare Stripe: " + err.message);
    }
});

app.get('/result', (req, res) => {
    res.send(`
        <div style="text-align:center;margin-top:50px;font-family:sans-serif;">
            <h1>Plata a reusit!</h1>
            <p>Multumim pentru achizitie.</p>
            <a href="/">Inapoi la site</a>
        </div>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server pornit pe portul ${PORT}`);
    console.log("Configurare Stripe verificata.");
});

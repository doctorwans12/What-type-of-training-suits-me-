require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Permite servirea fișierelor statice (imagini, logo) din folderul curent
app.use(express.static(__dirname));

// Configurare Nodemailer pentru Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

// Generator de text pentru cele 100 de săptămâni (pentru e-mailul inițial de bun venit)
const roadmapContent = Array.from({ length: 100 }, (_, i) => `Săptămâna ${i + 1}: Antrenament profesional nivel ${i + 101}. Focus pe progres constant.`).join('\n');

// 1. RUTA PRINCIPALĂ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. RUTA DE CREARE SESIUNE PLATĂ
app.get('/pay-session', async (req, res) => {
    const isSub = req.query.subscribe === 'true';
    const choice = req.query.choice; // 'power', 'speed' sau 'stamina'
    const priceId = isSub ? process.env.PRICE_ID_SUB : process.env.PRICE_ID_ONCE;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isSub ? 'subscription' : 'payment',
            // Direcționăm către ruta /success pentru procesare e-mail
            success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}&plan=${choice}&isSub=${isSub}`,
            cancel_url: `${req.protocol}://${req.get('host')}/`,
        });
        res.redirect(303, session.url);
    } catch (err) {
        console.error("Stripe Session Error:", err.message);
        res.status(500).send("Eroare la inițierea plății Stripe.");
    }
});

// 3. RUTA DE SUCCES (Trimite e-mail și dă redirect înapoi la front-end)
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        // Preluăm detaliile sesiunii pentru a obține e-mailul clientului
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        // Dacă utilizatorul a ales abonamentul (I Wish), îi trimitem roadmap-ul imediat
        if (isSub === 'true') {
            await transporter.sendMail({
                from: `"Professional Training" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Your 100-Week Training Roadmap",
                text: `Felicitări! Iată planul tău pe 100 de săptămâni:\n\n${roadmapContent}`,
                headers: {
                    "Precedence": "bulk",
                    "X-Priority": "5" // Forțează intrarea în folderul de Spam/Promotions
                }
            });
            console.log(`✅ Roadmap trimis către ${customerEmail}`);
        }

        // Redirecționăm înapoi la pagina principală cu parametrii necesari afișării în HTML
        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
    } catch (err) {
        console.error("Success Processing Error:", err.message);
        res.redirect("/"); // În caz de eroare, trimitem la început
    }
});

// 4. LOGICA PENTRU E-MAILURILE SĂPTĂMÂNALE (Bulk/Cron)
app.get('/send-weekly-bulk', async (req, res) => {
    if (req.query.secret !== "REGELE_SECRET_123") return res.status(403).send("Unauthorized");

    try {
        // Notă: Într-o aplicație reală, aici ai face un loop prin baza de date cu abonați
        const userEmail = "client@email.com"; 
        
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: userEmail,
            subject: "Your Weekly Training Roadmap (Update)",
            text: "Aceasta este saptamana ta de antrenament profesional. Nu te opri acum!",
            headers: {
                "Precedence": "bulk",
                "X-Priority": "5",
                "X-Auto-Response-Suppress": "All"
            }
        });
        res.send("E-mailul săptămânal a fost trimis în Spam.");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serverul rulează pe portul ${PORT}`));

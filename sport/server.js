require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron'); // <--- SCHIMBARE 1: Am adăugat librăria de programare

const app = express();
app.use(express.static(__dirname));

// Listă în memorie pentru a ține minte cine s-a abonat
// NOTĂ: Dacă repornești serverul, lista se golește. 
let subscribers = []; 

// CONFIGURARE NODEMAILER - Neschimbată
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS 
    },
    tls: {
        rejectUnauthorized: false
    }
});

// SCHIMBARE 2: Logica pentru e-mailul săptămânal
// Rulează în fiecare Luni la ora 09:00 ('0 9 * * 1')
cron.schedule('0 9 * * 1', () => {
    console.log("Trimitem update-ul săptămânal...");
    
    subscribers.forEach(email => {
        const mailOptions = {
            from: `"Personal Trainer" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: "Important: Your Training Results",
            text: `Hi! Thank you for choosing our program. Here is your professional roadmap. Let's get to work!`
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) console.log("❌ Eroare Mail Săptămânal:", err.message);
            else console.log(`✅ Mail trimis cu succes către: ${email}`);
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. RUTA DE PLATA - Neschimbată
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
        res.status(500).send("Eroare la Stripe.");
    }
});

// 2. RUTA DE SUCCES - Actualizată doar pentru a salva email-ul
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        if (isSub === 'true') {
            // SCHIMBARE 3: Salvăm email-ul în listă pentru a-i trimite săptămânal
            if (!subscribers.includes(customerEmail)) {
                subscribers.push(customerEmail);
            }

            // Trimitem mail-ul de confirmare IMEDIAT după plată (cel pus de tine)
            const mailOptions = {
                from: `"Personal Trainer" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Important: Your Training Results",
                text: `Hi! Thank you for choosing our program. Here is your professional roadmap. Let's get to work!`
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) console.log("❌ Eroare Mail Confirmare:", err.message);
                else console.log("✅ Mail de bun venit trimis!");
            });
        }

        res.redirect(`/?session_id=${session_id}&plan=${plan}&isSub=${isSub}`);
        
    } catch (err) {
        console.error("Success Route Error:", err.message);
        res.redirect("/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server activ pe portul ${PORT}`));



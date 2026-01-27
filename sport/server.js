require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cron = require('node-cron');
const weeklyContent = require('./content.js'); // Importăm textele

// Configurare Bază de Date (pentru a nu pierde progresul celor 100 săpt)
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);

// Inițializăm baza de date dacă e goală
db.defaults({ subscribers: [] }).write();

const app = express();
app.use(express.static(__dirname));

// CONFIGURARE NODEMAILER
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

// CRON JOB - Trimite e-mail în fiecare Luni la ora 09:00
cron.schedule('0 9 * * 1', () => {
    console.log("🔔 Pornire proces trimitere e-mailuri săptămânale...");
    const subscribers = db.get('subscribers').value();

    subscribers.forEach(user => {
        if (user.currentWeek < weeklyContent.length) {
            const mailOptions = {
                from: `"Personal Trainer" <${process.env.GMAIL_USER}>`,
                to: user.email,
                subject: `Planul tău: Săptămâna ${user.currentWeek + 1}`,
                text: weeklyContent[user.currentWeek]
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (!err) {
                    // Dacă s-a trimis, creștem săptămâna pentru acest user în DB
                    db.get('subscribers')
                      .find({ email: user.email })
                      .assign({ currentWeek: user.currentWeek + 1 })
                      .write();
                    console.log(`✅ Trimis Săpt ${user.currentWeek + 1} către: ${user.email}`);
                } else {
                    console.log(`❌ Eroare trimitere către ${user.email}:`, err.message);
                }
            });
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. RUTA DE PLATA
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

// 2. RUTA DE SUCCES
app.get('/success', async (req, res) => {
    const { session_id, plan, isSub } = req.query;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customerEmail = session.customer_details.email;

        if (isSub === 'true') {
            // SALVĂM CLIENTUL ÎN BAZA DE DATE (Dacă e nou)
            const userExists = db.get('subscribers').find({ email: customerEmail }).value();
            
            if (!userExists) {
                db.get('subscribers')
                  .push({ email: customerEmail, currentWeek: 0, plan: plan })
                  .write();
                console.log(`👤 Client nou abonat: ${customerEmail}`);
            }

            // Trimitem mail de bun venit imediat (Săptămâna 1)
            const welcomeMail = {
                from: `"Personal Trainer" <${process.env.GMAIL_USER}>`,
                to: customerEmail,
                subject: "Important: Your Training Results",
                text: `Hi! Thank you for choosing our program. Here is your professional roadmap: ${weeklyContent[0]}`
            };

            transporter.sendMail(welcomeMail, (err) => {
                if (err) console.log("❌ Eroare Mail Bun Venit:", err.message);
                else console.log("✅ Mail bun venit trimis!");
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

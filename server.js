const express = require('express');
const { firefox } = require('playwright');
const path = require('path');
const db = require('./database');

const app = express();

// মিডেলওয়্যার সেটআপ
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browser, context, page;
let isReady = false;

// --- রাউটিং (Frontend Routes) ---

// হোম পেজ (Chat Dashboard)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// এডমিন পেজ (Login/Config)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// --- এপিআই রাউটস (API Routes) ---

// এডমিন থেকে ক্রেডেনশিয়াল সেভ এবং সিস্টেম স্টার্ট করা
app.post('/api/save-config', (req, res) => {
    const { email, password } = req.body;
    
    db.run("INSERT OR REPLACE INTO config (id, email, password) VALUES (1, ?, ?)", [email, password], async (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        res.json({ success: true, message: "Credentials saved. Initializing DeepSeek..." });
        
        // ব্যাকগ্রাউন্ডে ব্রাউজার শুরু করা
        initDeepSeek(email, password);
    });
});

// Playwright দিয়ে DeepSeek অটোমেশন
async function initDeepSeek(email, password) {
    try {
        console.log("Starting browser...");
        if(browser) await browser.close();
        
        // Render-এর জন্য কিছু অতিরিক্ত আর্গুমেন্ট যোগ করা হয়েছে মেমোরি বাঁচাতে
        browser = await firefox.launch({ 
            headless: true
        });
        
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        page = await context.newPage();
        
        console.log("Navigating to DeepSeek Login...");
        await page.goto('https://chat.deepseek.com/login', { waitUntil: 'networkidle' });

        // লগইন লজিক (DeepSeek এর বর্তমান DOM অনুযায়ী)
        // দ্রষ্টব্য: এখানে ক্যাপচা আসলে আপনাকে ম্যানুয়ালি হ্যান্ডেল করতে হবে অথবা কুকি ব্যবহার করতে হবে।
        try {
            await page.fill('input[placeholder*="Email"]', email);
            await page.fill('input[placeholder*="Password"]', password);
            await page.click('button:has-text("Log in"), button[type="submit"]');
            
            // লগইন হওয়ার জন্য কিছুক্ষণ অপেক্ষা
            await page.waitForTimeout(5000); 
            console.log("Login attempt finished.");
            isReady = true;
        } catch (loginErr) {
            console.log("Login form interaction error (maybe already logged in or selectors changed):", loginErr.message);
            isReady = true; // অনেক সময় কুকি থাকলে সরাসরি ঢুকে যায়
        }

    } catch (error) {
        console.error("Browser Init Error:", error);
        isReady = false;
    }
}

// চ্যাট রিকোয়েস্ট হ্যান্ডেলার
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    if (!isReady || !page) {
        return res.status(503).json({ error: "System not ready. Please initialize from /admin first." });
    }

    try {
        // চ্যাট ইনপুট ফিল্ড খুঁজে মেসেজ পাঠানো
        const inputSelector = 'textarea#chat-input, textarea';
        await page.waitForSelector(inputSelector);
        await page.fill(inputSelector, message);
        await page.keyboard.press('Enter');

        // এআই উত্তরের জন্য অপেক্ষা (DeepSeek এর রেসপন্স টাইপ অনুযায়ী)
        // এটি একটি সাধারণ ওয়েট টাইম, রিয়েল টাইমে এটি আরও ডাইনামিক করা যায়
        await page.waitForTimeout(5000); 

        // শেষ উত্তরের টেক্সট স্ক্র্যাপ করা
        const responseText = await page.evaluate(() => {
            const nodes = document.querySelectorAll('.ds-markdown, .markdown-body');
            return nodes.length > 0 ? nodes[nodes.length - 1].innerText : "No response found.";
        });

        res.json({ reply: responseText });

    } catch (err) {
        console.error("Chat Error:", err);
        res.status(500).json({ error: "Failed to get response from DeepSeek." });
    }
});

// সার্ভার স্টার্ট
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Server is running on port: ${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`=========================================`);
});

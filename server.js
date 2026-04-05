const express = require('express');
const { firefox } = require('playwright');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browser, context, page;
let isReady = false;

// --- রাউটিং ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// --- সেশন ইনজেকশন এপিআই ---
app.post('/api/inject-session', async (req, res) => {
    const { cookies } = req.body;
    
    try {
        if(browser) await browser.close();
        
        console.log("Launching Browser with Injected Session...");
        browser = await firefox.launch({ headless: true });
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // কুকি ইনজেক্ট করা
        const cookieArray = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        await context.addCookies(cookieArray);
        
        page = await context.newPage();
        
        // চেক করা সেশন ঠিক আছে কি না
        await page.goto('https://chat.deepseek.com/', { waitUntil: 'networkidle' });
        
        const currentUrl = page.url();
        if (currentUrl.includes('login')) {
            throw new Error("Session expired or invalid. Please login again.");
        }

        isReady = true;
        console.log("Session successfully injected and live!");
        res.json({ success: true, message: "System is now LIVE and using your session!" });

    } catch (error) {
        console.error("Injection Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- চ্যাট রিকোয়েস্ট ---
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!isReady || !page) return res.status(503).json({ error: "System not ready. Inject session from /admin." });

    try {
        const inputSelector = 'textarea';
        await page.waitForSelector(inputSelector);
        await page.fill(inputSelector, message);
        await page.keyboard.press('Enter');

        // উত্তরের জন্য ৫ সেকেন্ড ওয়েট (এটি ডাইনামিক করা যেতে পারে)
        await page.waitForTimeout(5000); 

        const responseText = await page.evaluate(() => {
            const nodes = document.querySelectorAll('.ds-markdown, .markdown-body');
            return nodes.length > 0 ? nodes[nodes.length - 1].innerText : "Thinking...";
        });

        res.json({ reply: responseText });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch response. Session might be disconnected." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));

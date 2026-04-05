const express = require('express');
const { firefox } = require('playwright');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browser, context, page;
let isReady = false;

// এডমিন থেকে ক্রেডেনশিয়াল সেভ করা
app.post('/api/save-config', (req, res) => {
    const { email, password } = req.body;
    db.run("INSERT OR REPLACE INTO config (id, email, password) VALUES (1, ?, ?)", [email, password], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Credentials saved. Attempting system init..." });
        initDeepSeek(email, password);
    });
});

// Playwright দিয়ে ব্রাউজার রান করা
async function initDeepSeek(email, password) {
    try {
        if(browser) await browser.close();
        browser = await firefox.launch({ headless: true });
        context = await browser.newContext();
        page = await context.newPage();
        
        await page.goto('https://chat.deepseek.com/login');
        console.log("Navigated to login. Next steps depend on DeepSeek DOM changes.");
        
        // নোট: এখানে DeepSeek-এর ইনপুট ফিল্ডের সিলেক্টর দিয়ে email, password ফিল আপ এবং লগইন ক্লিক করাতে হবে।
        // ক্যাপচা থাকলে তা বাইপাস করার লজিক এখানে বসবে।
        
        isReady = true; 
    } catch (error) {
        console.error("Browser Init Error:", error);
    }
}

// চ্যাট রিকোয়েস্ট হ্যান্ডেলার
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!isReady || !page) return res.status(500).json({ error: "System not initialized or logged in yet." });

    try {
        // DeepSeek-এর চ্যাটবক্সের সিলেক্টর অনুযায়ী এটি পরিবর্তন করতে হবে
        await page.fill('textarea', message); 
        await page.keyboard.press('Enter');
        
        // উত্তর জেনারেট হওয়া পর্যন্ত অপেক্ষা
        await page.waitForTimeout(3000); 
        const responseText = await page.innerText('.markdown-body'); // ক্লাস নেম চেঞ্জ হতে পারে
        
        res.json({ reply: responseText });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

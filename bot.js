const { Telegraf, TelegramError } = require('telegraf');

// Replace with your own token
const token = '7209454605:AAHZ90zkTzriPOOUL-F_YEfZz3IaXChiHEk';

// Create a bot instance
const bot = new Telegraf(token);

// Handle incoming messages
bot.on('text', async (ctx) => {
    try {
        // Get chat ID
        const chatId = ctx.chat.id;

        // Print chat ID to the console
        console.log('Chat ID:', chatId);

        // Reply to the user
        await ctx.reply(`Your chat ID is: ${chatId}`);
    } catch (error) {
        if (error instanceof TelegramError) {
            console.error('TelegramError:', error.description);
            // Additional error handling can be added here
        } else {
            console.error('Error:', error.message);
        }
    }
});

// Start the bot
bot.launch().catch(error => {
    console.error('Error launching bot:', error.message);
});

console.log('Bot is up and running');

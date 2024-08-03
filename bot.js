

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const port = process.env.PORT || 32020;

const token = '7399253465:AAEZfwcFTCHU4_HPAgGWYTEUyKtaePboDTE';
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
      console.log(chatId)
// Corrected variable name
  bot.sendMessage(chatId, 'SHOP', {

    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'SHOP',
<<<<<<< HEAD
            web_app: { url: `https://cockies.onrender.com/?userId=${chatId}` }
=======
            web_app: { url: `https://wifi1-5m7j.onrender.com/?userId=${chatId}` }
>>>>>>> 36e25fd47f3906f20aae1dc36e649e77333af470
          }
        ]
      ]
    }
  });
  
});
app.get('/', (req, res) => {
    res.send('Telegram Bot is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
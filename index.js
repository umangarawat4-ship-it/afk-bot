const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const express = require('express');
const config = require('./settings.json');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

function createBot() {
    const bot = mineflayer.createBot({
        username: config['bot-account']['username'],
        password: config['bot-account']['password'],
        auth: config['bot-account']['type'],
        host: config.server.ip,
        port: config.server.port,
        version: config.server.version,
        checkTimeoutInterval: 60000,
        hideErrors: false
    });

    bot.loadPlugin(pathfinder);

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.scafoldingBlocks = [];
    bot.settings.colorsEnabled = false;

    let pendingPromise = Promise.resolve();

    function sendRegister(password) {
        return new Promise((resolve, reject) => {
            bot.chat(`/register ${password} ${password}`);
            console.log(`[Auth] Sent /register command.`);

            bot.once('chat', (username, message) => {
                console.log(`[ChatLog] <${username}> ${message}`);
                if (message.includes('successfully registered') || message.includes('already registered')) resolve();
                else reject(`Registration failed: ${message}`);
            });
        });
    }

    function sendLogin(password) {
        return new Promise((resolve, reject) => {
            bot.chat(`/login ${password}`);
            console.log(`[Auth] Sent /login command.`);
            bot.once('chat', (username, message) => {
                console.log(`[ChatLog] <${username}> ${message}`);
                if (message.includes('successfully logged in')) resolve();
                else reject(`Login failed: ${message}`);
            });
        });
    }

    bot.once('spawn', () => {
        console.log('[AfkBot] Bot joined the server');

        if (config.utils['auto-auth'].enabled) {
            const password = config.utils['auto-auth'].password;
            pendingPromise = pendingPromise
                .then(() => sendRegister(password))
                .then(() => sendLogin(password))
                .catch(error => console.error('[ERROR]', error));
        }

        // Example chat messages
        if (config.utils['chat-messages'].enabled) {
            const messages = config.utils['chat-messages']['messages'];
            if (config.utils['chat-messages'].repeat) {
                let i = 0;
                setInterval(() => {
                    bot.chat(messages[i]);
                    i = (i + 1) % messages.length;
                }, config.utils['chat-messages']['repeat-delay'] * 1000);
            } else {
                messages.forEach(msg => bot.chat(msg));
            }
        }

        // Anti-AFK simplified
        if (config.utils['anti-afk'].enabled) {
            setInterval(() => bot.look(Math.random() * Math.PI * 2, (Math.random()-0.5)*0.8), 3000);
            setInterval(() => {
                if (bot.pathfinder.isMoving()) bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 250);
            }, 5000);
        }
    });

    bot.on('end', () => {
        if (config.utils['auto-reconnect']) {
            setTimeout(createBot, config.utils['auto-reconnect-delay']);
        }
    });

    bot.on('kicked', reason => console.log(`[AfkBot] Kicked: ${reason}`));
    bot.on('error', err => console.log(`[ERROR] ${err.message}`));
}

createBot();

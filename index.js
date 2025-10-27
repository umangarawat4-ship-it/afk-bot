const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});

function createBot() {
   const bot = mineflayer.createBot({
      username: config['bot-account']['username'],
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
      checkTimeoutInterval: 60000, // Increase timeout to 60 seconds instead of 30
      hideErrors: false
   });

   bot.loadPlugin(pathfinder);
   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   defaultMove.canDig = false; // Don't break blocks
   defaultMove.scafoldingBlocks = []; // Don't place blocks
   bot.settings.colorsEnabled = false;

   let pendingPromise = Promise.resolve();

   function sendRegister(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[Auth] Sent /register command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            // Check for various possible responses
            if (message.includes('successfully registered')) {
               console.log('[INFO] Registration confirmed.');
               resolve();
            } else if (message.includes('already registered')) {
               console.log('[INFO] Bot was already registered.');
               resolve(); // Resolve if already registered
            } else if (message.includes('Invalid command')) {
               reject(`Registration failed: Invalid command. Message: "${message}"`);
            } else {
               reject(`Registration failed: unexpected message "${message}".`);
            }
         });
      });
   }

   function sendLogin(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/login ${password}`);
         console.log(`[Auth] Sent /login command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            if (message.includes('successfully logged in')) {
               console.log('[INFO] Login successful.');
               resolve();
            } else if (message.includes('Invalid password')) {
               reject(`Login failed: Invalid password. Message: "${message}"`);
            } else if (message.includes('not registered')) {
               reject(`Login failed: Not registered. Message: "${message}"`);
            } else {
               reject(`Login failed: unexpected message "${message}".`);
            }
         });
      });
   }

   bot.once('spawn', () => {
      console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

      if (config.utils['auto-auth'].enabled) {
         console.log('[INFO] Started auto-auth module');

         const password = config.utils['auto-auth'].password;

         pendingPromise = pendingPromise
            .then(() => sendRegister(password))
            .then(() => sendLogin(password))
            .catch(error => console.error('[ERROR]', error));
      }

      // Special login message - say "Umanga is always watching" 2 times every 15 seconds
      let umangaMessageCount = 0;
      const umangaInterval = setInterval(() => {
         if (umangaMessageCount < 2) {
            bot.chat('Umanga is always watching');
            umangaMessageCount++;
            console.log(`[INFO] Sent Umanga message (${umangaMessageCount}/2)`);
         } else {
            clearInterval(umangaInterval);
            console.log('[INFO] Finished sending Umanga messages');
         }
      }, 15000); // Every 15 seconds

      if (config.utils['chat-messages'].enabled) {
         console.log('[INFO] Started chat-messages module');
         const messages = config.utils['chat-messages']['messages'];

         if (config.utils['chat-messages'].repeat) {
            const delay = config.utils['chat-messages']['repeat-delay'];
            let i = 0;

            let msg_timer = setInterval(() => {
               bot.chat(`${messages[i]}`);

               if (i + 1 === messages.length) {
                  i = 0;
               } else {
                  i++;
               }
            }, delay * 1000);
         } else {
            messages.forEach((msg) => {
               bot.chat(msg);
            });
         }
      }

      const pos = config.position;

      if (config.position.enabled) {
         console.log(
            `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
         );
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      if (config.utils['anti-afk'].enabled) {
         console.log('[INFO] Started player-like anti-afk module');
         bot.pathfinder.setMovements(defaultMove);
         
         let isWandering = false;
         let isMining = false;
         
         // Wander to random locations (like a real player exploring)
         setInterval(() => {
            if (!isWandering) {
               isWandering = true;
               const currentPos = bot.entity.position;
               
               // Generate random destination 20-50 blocks away (walks farther)
               const distance = 20 + Math.random() * 30;
               const angle = Math.random() * Math.PI * 2;
               
               const targetX = Math.floor(currentPos.x + Math.cos(angle) * distance);
               const targetZ = Math.floor(currentPos.z + Math.sin(angle) * distance);
               const targetY = Math.floor(currentPos.y);
               
               console.log(`[AntiAFK] Wandering to location (${targetX}, ${targetY}, ${targetZ}) - ${Math.floor(distance)} blocks away`);
               
               const goal = new GoalBlock(targetX, targetY, targetZ);
               bot.pathfinder.setGoal(goal, true);
               
               // Walk for longer duration
               setTimeout(() => {
                  bot.pathfinder.setGoal(null);
                  isWandering = false;
                  console.log('[AntiAFK] Stopped wandering');
               }, 20000 + Math.random() * 20000);
            }
         }, 5000 + Math.random() * 5000); // Wander every 5-10 seconds (much more frequent)
         
         // Mine blocks occasionally (less frequent so bot walks more)
         setInterval(() => {
            if (!isMining && !isWandering && Math.random() > 0.5) {
               try {
                  isMining = true;
                  
                  // Find nearby blocks to mine
                  const blockTypes = ['dirt', 'grass_block', 'stone', 'gravel', 'sand', 'log', 'oak_log'];
                  let targetBlock = null;
                  
                  // Try to find a mineable block nearby
                  for (const blockType of blockTypes) {
                     const block = bot.findBlock({
                        matching: (b) => b && b.name && b.name.includes(blockType.split('_')[0]),
                        maxDistance: 8,
                        count: 1
                     });
                     
                     if (block) {
                        targetBlock = block;
                        break;
                     }
                  }
                  
                  if (targetBlock) {
                     console.log(`[AntiAFK] Mining ${targetBlock.name} at ${targetBlock.position}`);
                     
                     // Look at the block
                     bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5));
                     
                     // Dig the block
                     bot.dig(targetBlock, (err) => {
                        if (err) {
                           console.log(`[AntiAFK] Mining failed: ${err.message}`);
                        } else {
                           console.log(`[AntiAFK] Successfully mined ${targetBlock.name}`);
                        }
                        isMining = false;
                     });
                  } else {
                     isMining = false;
                  }
               } catch (err) {
                  console.log(`[AntiAFK] Mining error: ${err.message}`);
                  isMining = false;
               }
            }
         }, 20000 + Math.random() * 15000); // Mine every 20-35 seconds (less often to prioritize walking)
         
         // Look around naturally
         setInterval(() => {
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() - 0.5) * 0.8;
            bot.look(yaw, pitch);
         }, 2000 + Math.random() * 3000);
         
         // Random jumping while walking
         setInterval(() => {
            if (bot.pathfinder.isMoving()) {
               bot.setControlState('jump', true);
               setTimeout(() => {
                  bot.setControlState('jump', false);
               }, 250);
            }
         }, 4000 + Math.random() * 3000);
         
         // Swing arm occasionally (like trying to hit something)
         setInterval(() => {
            bot.swingArm();
         }, 5000 + Math.random() * 5000);
         
         // Random sneaking
         if (config.utils['anti-afk'].sneak) {
            setInterval(() => {
               bot.setControlState('sneak', true);
               setTimeout(() => {
                  bot.setControlState('sneak', false);
               }, 1000 + Math.random() * 2000);
            }, 20000 + Math.random() * 10000);
         }
         
         // Sprint occasionally when moving
         setInterval(() => {
            if (bot.pathfinder.isMoving()) {
               bot.setControlState('sprint', true);
               setTimeout(() => {
                  bot.setControlState('sprint', false);
               }, 2000 + Math.random() * 3000);
            }
         }, 8000 + Math.random() * 7000);
      }
   });

   bot.on('goal_reached', () => {
      console.log(
         `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
      );
   });

   bot.on('death', () => {
      console.log(
         `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
         '\x1b[0m'
      );
      bot.chat('MY MASTER WILL TAKE HIS REVANGE');
   });

   if (config.utils['auto-reconnect']) {
      bot.on('end', () => {
         setTimeout(() => {
            createBot();
         }, config.utils['auto-recconect-delay']);
      });
   }

   bot.on('kicked', (reason) =>
      console.log(
         '\x1b[33m',
         `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
         '\x1b[0m'
      )
   );

   bot.on('error', (err) =>
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m')
   );
}

createBot();

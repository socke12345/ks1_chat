const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Erlaubt Bilder bis 10MB
});

app.use(express.static(path.join(__dirname, 'public')));

// KONFIGURATION
let globalUserPassword = "user123"; 
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "adminSecret";
let isChatMuted = false; // Global Mute Status

// User State
let users = {}; 

io.on('connection', (socket) => {
    
    // --- LOGIN ---
    socket.on('join', ({ username, password, isAdmin }) => {
        // Validation
        if (!username || username.trim().length < 2) {
            return socket.emit('errorMsg', 'Name zu kurz!');
        }

        const cleanName = username.trim().substring(0, 15); // Max 15 Zeichen

        // Admin Check
        if (isAdmin) {
            if (password === ADMIN_PASSWORD) {
                loginUser(socket, "ADMIN", 'admin', "https://api.dicebear.com/7.x/bottts/svg?seed=ADMIN&backgroundColor=c0392b");
            } else {
                socket.emit('errorMsg', 'Admin Passwort falsch!');
            }
            return;
        }

        // User Check
        if (password === globalUserPassword) {
            const nameExists = Object.values(users).some(u => u.name.toLowerCase() === cleanName.toLowerCase());
            if (nameExists) return socket.emit('errorMsg', 'Name vergeben!');

            // Generiere Avatar URL
            const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanName}`;
            loginUser(socket, cleanName, 'user', avatar);
        } else {
            socket.emit('errorMsg', 'Raum-Passwort falsch!');
        }
    });

    function loginUser(socket, name, role, avatar) {
        users[socket.id] = { name, role, avatar, id: socket.id };
        socket.emit('loginSuccess', { name, role, avatar, isMuted: isChatMuted });
        
        // Broadcast System Message
        io.emit('message', {
            type: 'system',
            text: `${name} ist dem Quanten-Netzwerk beigetreten.`,
            time: getTime()
        });
        
        io.emit('updateUserList', Object.values(users));
    }

    // --- MESSAGING ---
    socket.on('chatMessage', (data) => {
        const user = users[socket.id];
        if (!user) return;
        
        // Wenn Chat global gemutet ist und user kein Admin ist
        if (isChatMuted && user.role !== 'admin') {
            return socket.emit('errorMsg', 'Der Chat ist momentan stummgeschaltet!');
        }

        // TEXT NACHRICHT
        if (data.type === 'text') {
            // Flüster Check
            if (data.content.startsWith('/w ')) {
                handleWhisper(socket, user, data.content);
                return;
            }

            io.emit('message', {
                type: 'text',
                user: user,
                text: data.content,
                time: getTime()
            });
        }
        
        // BILD NACHRICHT
        else if (data.type === 'image') {
            io.emit('message', {
                type: 'image',
                user: user,
                image: data.content, // Base64 String
                time: getTime()
            });
        }
    });

    // --- TYPING INDICATOR ---
    socket.on('typing', (isTyping) => {
        const user = users[socket.id];
        if (user) {
            socket.broadcast.emit('userTyping', { user: user.name, isTyping });
        }
    });

    // --- ADMIN COMMANDS ---
    socket.on('adminAction', (action) => {
        const user = users[socket.id];
        if (!user || user.role !== 'admin') return;

        switch (action.type) {
            case 'clearChat':
                io.emit('clearChat');
                io.emit('message', { type: 'system', text: 'Der Chatverlauf wurde vom Admin bereinigt.', time: getTime() });
                break;
            
            case 'toggleMute':
                isChatMuted = !isChatMuted;
                io.emit('muteStatus', isChatMuted);
                io.emit('message', { type: 'system', text: isChatMuted ? 'CHAT STUMMGESCHALTET 🔒' : 'CHAT FREIGEGEBEN 🔓', time: getTime() });
                break;

            case 'announcement':
                io.emit('announcement', action.text);
                break;

            case 'kick':
                const targetSocket = io.sockets.sockets.get(action.targetId);
                if (targetSocket) {
                    targetSocket.emit('kicked');
                    targetSocket.disconnect();
                    io.emit('message', { type: 'system', text: 'Ein User wurde aus der Matrix entfernt.', time: getTime() });
                }
                break;
                
            case 'changePass':
                globalUserPassword = action.newPass;
                socket.emit('errorMsg', 'Passwort erfolgreich geändert!'); // Missbrauche ErrorMsg als Info
                break;
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            io.emit('message', { type: 'system', text: `${user.name} hat die Verbindung verloren.`, time: getTime() });
            delete users[socket.id];
            io.emit('updateUserList', Object.values(users));
        }
    });

    function getTime() {
        return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    
    function handleWhisper(socket, user, msg) {
        const parts = msg.split(' ');
        if (parts.length < 3) return;
        const targetName = parts[1];
        const text = parts.slice(2).join(' ');
        
        const target = Object.values(users).find(u => u.name === targetName);
        
        if (target) {
            const payload = { type: 'whisper', from: user.name, text: text, time: getTime() };
            io.to(target.id).emit('message', payload);
            socket.emit('message', { ...payload, isSelf: true, to: targetName }); // Für Sender
        } else {
            socket.emit('errorMsg', `User ${targetName} nicht gefunden.`);
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Quantum Server läuft auf ${PORT}`));

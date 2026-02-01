const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public')));

let globalUserPassword = "user123"; 
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "adminSecret";
let isChatMuted = false;
let users = {}; 

io.on('connection', (socket) => {
    socket.on('join', ({ username, password, isAdmin }) => {
        if (!username || username.trim().length < 2) return socket.emit('errorMsg', 'Name zu kurz!');
        const cleanName = username.trim().substring(0, 15);

        if (isAdmin) {
            if (password === ADMIN_PASSWORD) {
                loginUser(socket, "ADMIN", 'admin', `https://api.dicebear.com/7.x/bottts/svg?seed=ADMIN`);
            } else {
                socket.emit('errorMsg', 'Admin Passwort falsch!');
            }
            return;
        }

        if (password === globalUserPassword) {
            if (Object.values(users).some(u => u.name.toLowerCase() === cleanName.toLowerCase())) {
                return socket.emit('errorMsg', 'Name vergeben!');
            }
            const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanName}`;
            loginUser(socket, cleanName, 'user', avatar);
        } else {
            socket.emit('errorMsg', 'Raum-Passwort falsch!');
        }
    });

    function loginUser(socket, name, role, avatar) {
        users[socket.id] = { name, role, avatar, id: socket.id };
        socket.emit('loginSuccess', { name, role, avatar, id: socket.id });
        io.emit('updateUserList', Object.values(users));
        io.emit('message', { type: 'system', text: `${name} ist dem Netzwerk beigetreten.`, time: getTime() });
    }

    socket.on('chatMessage', (data) => {
        const user = users[socket.id];
        if (!user || (isChatMuted && user.role !== 'admin')) return;

        const payload = {
            type: data.isPrivate ? 'private' : 'text',
            user: user,
            text: data.content,
            time: getTime(),
            from: socket.id,
            to: data.to // socketId des Empfängers bei Privatnachrichten
        };

        if (data.isPrivate && data.to) {
            io.to(data.to).emit('message', payload);
            socket.emit('message', payload); // Echo an den Sender
        } else {
            io.emit('message', payload);
        }
    });

    socket.on('adminAction', (action) => {
        const user = users[socket.id];
        if (!user || user.role !== 'admin') return;
        if (action.type === 'clearChat') io.emit('clearChat');
        if (action.type === 'toggleMute') {
            isChatMuted = !isChatMuted;
            io.emit('message', { type: 'system', text: isChatMuted ? 'CHAT STUMM' : 'CHAT AKTIV' });
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            delete users[socket.id];
            io.emit('updateUserList', Object.values(users));
        }
    });

    function getTime() { return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server auf Port ${PORT}`));

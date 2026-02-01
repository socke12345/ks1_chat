const socket = io();

// STATE
let currentUser = null;
let typingTimeout = null;

// DOM ELEMENTS
const screens = {
    login: document.getElementById('login-container'),
    chat: document.getElementById('chat-interface')
};
const inputs = {
    user: document.getElementById('username-in'),
    pass: document.getElementById('password-in'),
    admin: document.getElementById('admin-check'),
    msg: document.getElementById('msg-input'),
    img: document.getElementById('img-upload')
};
const chat = {
    msgs: document.getElementById('messages-container'),
    users: document.getElementById('user-list'),
    typing: document.getElementById('typing-indicator'),
    count: document.getElementById('count')
};
const soundPop = document.getElementById('sound-pop');

// --- LOGIN LOGIC ---
function attemptLogin() {
    const username = inputs.user.value;
    const password = inputs.pass.value;
    const isAdmin = inputs.admin.checked;

    socket.emit('join', { username, password, isAdmin });
}

socket.on('errorMsg', (msg) => {
    // Einfaches Error Handling im Login Text oder Alert
    const errElem = document.getElementById('login-error');
    if (screens.login.style.display !== 'none') {
        errElem.innerText = msg;
    } else {
        alert(msg); // Fehler im Chat (z.B. Mute)
    }
});

socket.on('loginSuccess', (user) => {
    currentUser = user;
    screens.login.style.display = 'none'; // Fade out wäre schöner, aber keep it simple
    screens.chat.classList.remove('hidden');
    
    if (user.role === 'admin') {
        document.getElementById('admin-panel').classList.remove('hidden');
    }
});

// --- MESSAGING LOGIC ---
function sendMessage() {
    const text = inputs.msg.value;
    if (!text.trim()) return;

    socket.emit('chatMessage', { type: 'text', content: text });
    inputs.msg.value = '';
    socket.emit('typing', false);
}

// BILD UPLOAD
inputs.img.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('chatMessage', { type: 'image', content: e.target.result });
        };
        reader.readAsDataURL(file);
        this.value = ''; // Reset
    }
});

// ENTER KEY & TYPING
inputs.msg.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') sendMessage();
    
    // Typing Indicator Logic
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('typing', false), 2000);
});

// --- RECEIVE EVENTS ---
socket.on('message', (data) => {
    renderMessage(data);
    if (!data.isSelf && data.type !== 'system') {
        soundPop.currentTime = 0;
        soundPop.play().catch(e => {}); // Play Sound (Browser Blockt manchmal ohne Interaktion)
    }
});

socket.on('userTyping', ({ user, isTyping }) => {
    chat.typing.innerText = isTyping ? `${user} tippt...` : '';
});

socket.on('updateUserList', (users) => {
    chat.users.innerHTML = '';
    chat.count.innerText = users.length;
    users.forEach(u => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
            <img src="${u.avatar}" alt="avatar">
            <div class="user-info">
                <div class="name ${u.role === 'admin' ? 'user-role-admin' : ''}">${u.name}</div>
            </div>
        `;
        
        // Klick für Flüster
        if (u.name !== currentUser.name) {
            li.onclick = () => {
                inputs.msg.value = `/w ${u.name} `;
                inputs.msg.focus();
            }
            
            // Admin Kick Funktion (Rechtsklick)
            if (currentUser.role === 'admin' && u.role !== 'admin') {
                li.oncontextmenu = (e) => {
                    e.preventDefault();
                    if(confirm(`${u.name} kicken?`)) {
                        socket.emit('adminAction', { type: 'kick', targetId: u.id });
                    }
                };
            }
        }
        
        chat.users.appendChild(li);
    });
});

socket.on('clearChat', () => {
    chat.msgs.innerHTML = '';
});

socket.on('kicked', () => {
    alert("SYSTEM: Verbindung vom Administrator getrennt.");
    location.reload();
});

socket.on('announcement', (text) => {
    document.getElementById('announcement-text').innerText = text;
    document.getElementById('announcement-modal').classList.remove('hidden');
});

// --- RENDER FUNCTIONS ---
function renderMessage(data) {
    const div = document.createElement('div');
    
    if (data.type === 'system') {
        div.className = 'system-msg';
        div.innerHTML = `<i class="fa-solid fa-info-circle"></i> ${data.text}`;
    } else {
        const isSelf = data.user.name === currentUser.name;
        div.className = `msg ${isSelf ? 'self' : ''} ${data.type === 'whisper' ? 'whisper' : ''}`;
        
        let contentHtml = '';
        if (data.type === 'text' || data.type === 'whisper') {
            contentHtml = `<p>${data.text}</p>`;
        } else if (data.type === 'image') {
            contentHtml = `<img src="${data.image}" class="chat-image">`;
        }

        div.innerHTML = `
            <img src="${data.user.avatar}" class="msg-avatar">
            <div class="msg-content">
                <span class="meta">${isSelf ? 'Du' : data.user.name}</span>
                ${contentHtml}
                <span class="time">${data.time}</span>
            </div>
        `;
    }
    
    chat.msgs.appendChild(div);
    chat.msgs.scrollTop = chat.msgs.scrollHeight;
}

// --- UI HELPERS ---
function toggleEmoji() {
    const bar = document.getElementById('emoji-bar');
    bar.classList.toggle('hidden');
}

function addEmoji(emoji) {
    inputs.msg.value += emoji;
    inputs.msg.focus();
}

function closeModal() {
    document.getElementById('announcement-modal').classList.add('hidden');
}

// ADMIN ACTIONS
function adminAction(type) {
    socket.emit('adminAction', { type });
}

function sendAnnouncement() {
    const text = prompt("Text für System-Nachricht:");
    if (text) socket.emit('adminAction', { type: 'announcement', text });
}

function changeGlobalPass() {
    const pass = prompt("Neues globales User-Passwort:");
    if (pass) socket.emit('adminAction', { type: 'changePass', newPass: pass });
}

const socket = io();
let currentUser = null;
let activeChat = 'global';
let chatHistory = { 'global': [] };

function attemptLogin() {
    const username = document.getElementById('username-in').value;
    const password = document.getElementById('password-in').value;
    const isAdmin = document.getElementById('admin-check').checked;
    socket.emit('join', { username, password, isAdmin });
}

socket.on('loginSuccess', (user) => {
    currentUser = user;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('chat-interface').classList.remove('hidden');
});

socket.on('updateUserList', (users) => {
    const list = document.getElementById('user-list');
    list.innerHTML = `<li onclick="switchToGlobal()" class="user-item ${activeChat === 'global' ? 'active' : ''}">Globaler Chat</li>`;
    users.forEach(u => {
        if (u.id === socket.id) return;
        const li = document.createElement('li');
        li.className = `user-item ${activeChat === u.id ? 'active' : ''}`;
        li.innerText = u.name;
        li.onclick = () => switchToPrivate(u.id, u.name);
        list.appendChild(li);
    });
});

function switchToGlobal() {
    activeChat = 'global';
    document.getElementById('current-chat-title').innerText = "GLOBAL";
    renderMessages();
}

function switchToPrivate(id, name) {
    activeChat = id;
    document.getElementById('current-chat-title').innerText = `Chat mit ${name}`;
    renderMessages();
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    if (!input.value.trim()) return;
    socket.emit('chatMessage', {
        content: input.value,
        isPrivate: activeChat !== 'global',
        to: activeChat
    });
    input.value = '';
}

socket.on('message', (data) => {
    const key = data.type === 'private' ? (data.from === socket.id ? data.to : data.from) : 'global';
    if (!chatHistory[key]) chatHistory[key] = [];
    chatHistory[key].push(data);
    if (activeChat === key) renderMessages();
    if (data.from !== socket.id) document.getElementById('sound-pop').play();
});

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    (chatHistory[activeChat] || []).forEach(msg => {
        const div = document.createElement('div');
        if (msg.type === 'system') {
            div.className = 'system-msg';
            div.innerText = msg.text;
        } else {
            const isSelf = msg.user.id === socket.id;
            div.className = `msg ${isSelf ? 'self' : 'other'}`;
            div.innerHTML = `<small>${msg.user.name}</small><br>${msg.text}`;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function toggleEmoji() { document.getElementById('emoji-picker').classList.toggle('hidden'); }
function addEmoji(e) { document.getElementById('msg-input').value += e; toggleEmoji(); }

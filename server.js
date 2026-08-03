const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { textMsgs: [], photoMsgs: [] };

// Cargar datos guardados
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e){}
}

function save() {
  fs.writeFile(DATA_FILE, JSON.stringify(data), ()=>{});
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req,res)=>res.send('ok'));

io.on('connection', (socket) => {
  // Solo manda las ultimas 20 para ahorrar megas
  socket.emit('init', {
    textMsgs: data.textMsgs.slice(-20),
    photoMsgs: data.photoMsgs.slice(-20),
    totalText: data.textMsgs.length,
    totalPhoto: data.photoMsgs.length
  });

  socket.on('load-more', ({type, offset})=>{
    if(type==='photo'){
      const more = data.photoMsgs.slice(-(offset+20), -offset || undefined);
      socket.emit('more-photos', more);
    } else {
      const more = data.textMsgs.slice(-(offset+20), -offset || undefined);
      socket.emit('more-texts', more);
    }
  });

  socket.on('send-text', ({text,image}) => {
    const msg = { id: Date.now().toString(), text, image, replies:[], time: Date.now() };
    data.textMsgs.push(msg);
    save();
    io.emit('new-text', msg);
  });

  socket.on('send-photo', ({text,image}) => {
    const msg = { id: Date.now().toString(), text, image, replies:[], time: Date.now() };
    data.photoMsgs.push(msg);
    save();
    io.emit('new-photo', msg);
  });

  socket.on('reply', ({type, parentId, text}) => {
    const list = type==='text' ? data.textMsgs : data.photoMsgs;
    const parent = list.find(m=>m.id===parentId);
    if(parent){
      parent.replies = parent.replies || [];
      parent.replies.push({ id: Date.now().toString(), text });
      save();
      io.emit('update-replies', {type, parentId, replies: parent.replies});
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('MJSCONAMIX corriendo en '+PORT));

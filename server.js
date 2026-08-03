const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const DATA_FILE = path.join(__dirname, 'data.json');
const ADMIN_PASS = "conamix123"; // <-- CAMBIA TU CONTRASEÑA AQUI

let data = { textMsgs: [], photoMsgs: [] };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e){}
}
function save() { fs.writeFile(DATA_FILE, JSON.stringify(data), ()=>{}); }
function getSizeMB(){ try{ const s=fs.statSync(DATA_FILE).size; return (s/1024/1024).toFixed(2); }catch(e){return "0";} }

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req,res)=>res.send('ok'));

io.on('connection', (socket) => {
  let isAdmin = false;

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
    data.textMsgs.push(msg); save(); io.emit('new-text', msg);
  });

  socket.on('send-photo', ({text,image}) => {
    const msg = { id: Date.now().toString(), text, image, replies:[], time: Date.now() };
    data.photoMsgs.push(msg); save(); io.emit('new-photo', msg);
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

  // ADMIN
  socket.on('admin-login', (pass)=>{
    if(pass===ADMIN_PASS){ isAdmin=true; socket.emit('admin-ok', {textCount:data.textMsgs.length, photoCount:data.photoMsgs.length, sizeMB:getSizeMB(), allText:data.textMsgs.slice().reverse(), allPhoto:data.photoMsgs.slice().reverse()}); }
    else socket.emit('admin-error');
  });
  socket.on('admin-delete', ({type,id})=>{
    if(!isAdmin) return;
    if(type==='text') data.textMsgs = data.textMsgs.filter(m=>m.id!==id);
    else data.photoMsgs = data.photoMsgs.filter(m=>m.id!==id);
    save();
    socket.emit('admin-ok', {textCount:data.textMsgs.length, photoCount:data.photoMsgs.length, sizeMB:getSizeMB(), allText:data.textMsgs.slice().reverse(), allPhoto:data.photoMsgs.slice().reverse()});
    io.emit('reload');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('MJSCONAMIX corriendo en '+PORT));

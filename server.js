const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const ADMIN_PASS = "DVS1404";
app.use(express.json({limit:'15mb'}));
app.use(express.static('public'));
let data = { mapImage: "", rooms: [{id:"101",name:"101",x:20,y:30},{id:"102",name:"102",x:50,y:30},{id:"103",name:"103",x:80,y:30},{id:"201",name:"201",x:20,y:60},{id:"202",name:"202",x:50,y:60},{id:"banos",name:"Baños",x:80,y:60}], messages: {} };
try{ if(fs.existsSync('data.json')) data = JSON.parse(fs.readFileSync('data.json','utf8')); }catch(e){}
function save(){ fs.writeFileSync('data.json', JSON.stringify(data)); }
io.on('connection', socket => {
  socket.emit('init-data', data);
  socket.on('join-room', id => { socket.join(id); socket.emit('room-messages', data.messages[id]||[]); });
  socket.on('send-message', ({roomId,text})=>{
    text=text.trim().substring(0,200); if(!text) return;
    if(!data.messages[roomId]) data.messages[roomId]=[];
    const msg={id:Date.now().toString(), text, time:Date.now()};
    data.messages[roomId].push(msg); save();
    io.to(roomId).emit('new-message', msg);
    io.emit('msg-count-update',{roomId,count:data.messages[roomId].length});
  });
  socket.on('admin-login',(p,cb)=>cb(p===ADMIN_PASS));
  socket.on('admin-save-rooms',(p,r)=>{ if(p!==ADMIN_PASS) return; data.rooms=r; save(); io.emit('rooms-update',r); });
  socket.on('admin-save-map',(p,img)=>{ if(p!==ADMIN_PASS) return; data.mapImage=img; save(); io.emit('map-update',img); });
  socket.on('admin-delete-msg',(p,roomId,msgId)=>{ if(p!==ADMIN_PASS) return; data.messages[roomId]=data.messages[roomId].filter(m=>m.id!==msgId); save(); io.to(roomId).emit('room-messages',data.messages[roomId]); });
  socket.on('admin-clear-room',(p,roomId)=>{ if(p!==ADMIN_PASS) return; data.messages[roomId]=[]; save(); io.to(roomId).emit('room-messages',[]); });
});
http.listen(process.env.PORT||3000);

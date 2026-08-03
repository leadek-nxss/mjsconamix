const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const fs = require('fs');

const PASS = "DVS1404";
app.use(express.json({limit:'20mb'}));
app.use(express.static('public'));

let data = { textMsgs: [], photoMsgs: [] };
try {
  if (fs.existsSync('data.json')) {
    const j = JSON.parse(fs.readFileSync('data.json','utf8'));
    data.textMsgs = j.textMsgs || [];
    data.photoMsgs = j.photoMsgs || [];
  }
} catch(e){}

function save(){ fs.writeFileSync('data.json', JSON.stringify(data)); }

app.get('/api/admin/all', (req,res)=>{
  if(req.query.pass!== PASS) return res.status(401).send('no');
  res.json(data);
});
app.post('/api/admin/delete', (req,res)=>{
  if(req.body.pass!== PASS) return res.status(401).send('no');
  if(req.body.type === 'photo') data.photoMsgs = data.photoMsgs.filter(m=>m.id!== req.body.id);
  else data.textMsgs = data.textMsgs.filter(m=>m.id!== req.body.id);
  save(); io.emit('reload'); res.json({ok:true});
});
app.post('/api/admin/login', (req,res)=> res.json({ok:req.body.pass===PASS}));

io.on('connection', socket=>{
  socket.emit('init', data);
  socket.on('send-text', (d)=>{
    let text = typeof d==='string'? d : d.text || '';
    let image = typeof d==='object'? d.image : null;
    text = text.trim().slice(0,300);
    if(!text &&!image) return;
    const m = { id: Date.now().toString(), text, image, time: Date.now() };
    data.textMsgs.push(m); save(); io.emit('new-text', m);
  });
  socket.on('send-photo', (d)=>{
    if(!d.image) return;
    const m = { id: Date.now().toString(), text: (d.text||'').slice(0,300), image: d.image, time: Date.now() };
    data.photoMsgs.push(m); save(); io.emit('new-photo', m);
  });
});

http.listen(process.env.PORT || 3000, ()=>console.log('ON'));

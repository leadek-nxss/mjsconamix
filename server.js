const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { maxHttpBufferSize: 10e6 });
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const ADMIN_PASS = "DVS1404";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

let data = { textMsgs: [], photoMsgs: [] };
try { 
  if(fs.existsSync('data.json')) {
    const j = JSON.parse(fs.readFileSync('data.json','utf8'));
    data.textMsgs = j.textMsgs || j.messages || [];
    data.photoMsgs = j.photoMsgs || [];
  }
} catch(e){}
function save(){ try{ fs.writeFileSync('data.json', JSON.stringify(data)); }catch(e){} }
function shuffle(a){ return [...a].sort(()=>0.5-Math.random()); }

io.on('connection', socket => {
  socket.emit('init-feed', {
    texts: shuffle(data.textMsgs).slice(0,100),
    photos: shuffle(data.photoMsgs).slice(0,100)
  });

  socket.on('send-text', text=>{
    text=(text||"").trim().substring(0,300); if(!text) return;
    const msg={id:Date.now().toString(), text, image:null, replies:[], time:Date.now()};
    data.textMsgs.push(msg); if(data.textMsgs.length>1000) data.textMsgs.shift(); save();
    io.emit('new-text', msg);
  });

  socket.on('send-photo', async ({text,image})=>{
    if(!image) return;
    try{
      let finalUrl = image;
      // Si tienes Cloudinary configurado, súbela. Si no, usa base64
      if(process.env.CLOUDINARY_CLOUD_NAME){
        const up = await cloudinary.uploader.upload(image, { folder:"mjsconamix", transformation:[{width:600, crop:"limit", quality:"auto:good"}] });
        finalUrl = up.secure_url;
      }
      const msg={id:Date.now().toString(), text:(text||"").trim().substring(0,200), image: finalUrl, replies:[], time:Date.now(), public_id: null};
      // Si es foto, siempre va a fotos, así admin la ve
      data.photoMsgs.push(msg); if(data.photoMsgs.length>1000) data.photoMsgs.shift(); save();
      io.emit('new-photo', msg);
    }catch(e){ console.log(e); socket.emit('upload-error','Error subiendo'); }
  });

  socket.on('reply', ({type, parentId, text})=>{
    text=(text||"").trim().substring(0,200); if(!text) return;
    const list = type==='text'? data.textMsgs : data.photoMsgs;
    const parent = list.find(m=>m.id===parentId); if(!parent) return;
    if(!parent.replies) parent.replies=[];
    parent.replies.push({id:Date.now().toString(), text, time:Date.now()});
    save(); io.emit('update-replies', {type, parentId, replies: parent.replies});
  });

  // --- ADMIN ---
  socket.on('admin-login',(p,cb)=> cb(p===ADMIN_PASS) );
  socket.on('admin-get-all',(p,cb)=>{
    if(p!==ADMIN_PASS) return cb(null);
    cb(data);
  });
  socket.on('admin-delete',(p,type,id)=>{
    if(p!==ADMIN_PASS) return;
    if(type==='text') data.textMsgs=data.textMsgs.filter(m=>m.id!==id);
    else data.photoMsgs=data.photoMsgs.filter(m=>m.id!==id);
    save();
    // manda update a todos
    io.emit('admin-updated', data);
  });
  socket.on('admin-delete-reply',(p,type,parentId,replyId)=>{
    if(p!==ADMIN_PASS) return;
    const list = type==='text'? data.textMsgs : data.photoMsgs;
    const parent=list.find(m=>m.id===parentId); if(!parent) return;
    parent.replies=parent.replies.filter(r=>r.id!==replyId); save();
    io.emit('update-replies', {type, parentId, replies: parent.replies});
  });
});

http.listen(process.env.PORT||3000, ()=>console.log('Listo'));

// Game overlay window (수정내역 34). Transparent, frameless, always on top of Warcraft III (windowed or borderless
// fullscreen; exclusive fullscreen draws over any window). The renderer runs ../dist/advisor.mjs in a worker.
// Hotkeys: Ctrl+Shift+O click-through on/off, Ctrl+Shift+H show/hide, Ctrl+Shift+M compact/full panel.
const {app,BrowserWindow,globalShortcut,ipcMain,dialog,protocol,net,screen}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');

const ROOT=path.resolve(__dirname,'..');                 // repository root: serves dist/ and overlay/renderer/
const SETTINGS=()=>path.join(app.getPath('userData'),'settings.json');
const readSettings=()=>{try{return JSON.parse(fs.readFileSync(SETTINGS(),'utf8'));}catch{return {};}};
const writeSettings=s=>{fs.mkdirSync(path.dirname(SETTINGS()),{recursive:true});fs.writeFileSync(SETTINGS(),JSON.stringify(s,null,1));};

protocol.registerSchemesAsPrivileged([{scheme:'ordsim',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);

let win,clickThrough=false;
const watchers=new Map();

function createWindow(){
  const s=readSettings(),wa=screen.getPrimaryDisplay().workArea;
  const b=s.bounds??{width:420,height:640,x:wa.x+wa.width-440,y:wa.y+80};
  win=new BrowserWindow({...b,transparent:true,frame:false,resizable:true,skipTaskbar:true,hasShadow:false,
    alwaysOnTop:true,focusable:true,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'screen-saver');
  win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  win.loadURL('ordsim://app/overlay/renderer/index.html');
  const save=()=>{const st=readSettings();st.bounds=win.getBounds();writeSettings(st);};
  win.on('moved',save);win.on('resized',save);
}

function setClickThrough(on){
  clickThrough=on;win.setIgnoreMouseEvents(on,{forward:true});
  win.webContents.send('overlay:mode',{clickThrough:on});
}

app.whenReady().then(()=>{
  // Only files under the repository root are served (dist/ engine + data, overlay/renderer UI).
  protocol.handle('ordsim',req=>{
    const u=new URL(req.url),file=path.normalize(path.join(ROOT,decodeURIComponent(u.pathname)));
    if(!file.startsWith(ROOT+path.sep))return new Response('forbidden',{status:403});
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  globalShortcut.register('CommandOrControl+Shift+O',()=>setClickThrough(!clickThrough));
  globalShortcut.register('CommandOrControl+Shift+H',()=>win.isVisible()?win.hide():win.showInactive());
  globalShortcut.register('CommandOrControl+Shift+M',()=>win.webContents.send('overlay:toggle-compact'));
});
app.on('will-quit',()=>{globalShortcut.unregisterAll();for(const w of watchers.values())w.close();});
app.on('window-all-closed',()=>app.quit());

// --- IPC: settings, helper folder, files ---------------------------------------------------------------------------
ipcMain.handle('settings:get',()=>readSettings());
ipcMain.handle('settings:set',(_e,patch)=>{const s={...readSettings(),...patch};writeSettings(s);return s;});
ipcMain.handle('dialog:folder',async(_e,title)=>{
  const r=await dialog.showOpenDialog(win,{title,properties:['openDirectory']});
  return r.canceled?null:r.filePaths[0];
});
ipcMain.handle('dialog:file',async(_e,title)=>{
  const r=await dialog.showOpenDialog(win,{title,properties:['openFile'],filters:[{name:'JSON',extensions:['json','jsonl']},{name:'All',extensions:['*']}]});
  return r.canceled?null:r.filePaths[0];
});
// Read a text file (helper Data or log). Large logs: only the last maxBytes are returned.
ipcMain.handle('file:read',(_e,file,maxBytes=0)=>{
  const st=fs.statSync(file);
  if(!maxBytes||st.size<=maxBytes)return fs.readFileSync(file,'utf8');
  const fd=fs.openSync(file,'r'),buf=Buffer.alloc(maxBytes);
  fs.readSync(fd,buf,0,maxBytes,st.size-maxBytes);fs.closeSync(fd);
  return buf.toString('utf8');
});
ipcMain.handle('file:exists',(_e,file)=>fs.existsSync(file));
ipcMain.handle('dir:list',(_e,dir)=>{try{return fs.readdirSync(dir);}catch{return [];}});
// Watch a file (helper recommendation log); notifies the renderer on every change.
ipcMain.handle('file:watch',(_e,file)=>{
  watchers.get(file)?.close();
  const w=fs.watch(file,{persistent:false},()=>win?.webContents.send('file:changed',file));
  watchers.set(file,w);return true;
});
ipcMain.handle('file:unwatch',(_e,file)=>{watchers.get(file)?.close();watchers.delete(file);return true;});
ipcMain.handle('overlay:click-through',(_e,on)=>{setClickThrough(on);return on;});
ipcMain.handle('overlay:quit',()=>app.quit());

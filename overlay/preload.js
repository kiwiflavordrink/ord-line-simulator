// Narrow bridge for the renderer: settings, folder/file pickers, read and watch files. No Node access in the page.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('ordApi',{
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  setSettings:patch=>ipcRenderer.invoke('settings:set',patch),
  pickFolder:title=>ipcRenderer.invoke('dialog:folder',title),
  pickFile:title=>ipcRenderer.invoke('dialog:file',title),
  readFile:(file,maxBytes)=>ipcRenderer.invoke('file:read',file,maxBytes),
  exists:file=>ipcRenderer.invoke('file:exists',file),
  listDir:dir=>ipcRenderer.invoke('dir:list',dir),
  watch:file=>ipcRenderer.invoke('file:watch',file),
  unwatch:file=>ipcRenderer.invoke('file:unwatch',file),
  setClickThrough:on=>ipcRenderer.invoke('overlay:click-through',on),
  quit:()=>ipcRenderer.invoke('overlay:quit'),
  memStart:player=>ipcRenderer.invoke('memscan:start',player),
  memStop:()=>ipcRenderer.invoke('memscan:stop'),
  onMemLog:cb=>ipcRenderer.on('memscan:log',(_e,t)=>cb(t)),
  onFileChanged:cb=>ipcRenderer.on('file:changed',(_e,f)=>cb(f)),
  onMode:cb=>ipcRenderer.on('overlay:mode',(_e,m)=>cb(m)),
  onToggleCompact:cb=>ipcRenderer.on('overlay:toggle-compact',()=>cb()),
});

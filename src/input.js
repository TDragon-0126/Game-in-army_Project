export function setupInput(canvas){
const state = { keys:{}, mouse:{ x:0, y:0, down:false } };
window.addEventListener('keydown', e=>{ state.keys[e.code] = true; });
window.addEventListener('keyup', e=>{ state.keys[e.code] = false; });
canvas.addEventListener('mousedown', ()=>{ state.mouse.down = true; });
window.addEventListener('mouseup', ()=>{ state.mouse.down = false; });
canvas.addEventListener('mousemove', e=>{
const rect = canvas.getBoundingClientRect();
state.mouse.x = (e.clientX - rect.left) * (canvas.width/rect.width) / (window.devicePixelRatio||1);
state.mouse.y = (e.clientY - rect.top ) * (canvas.height/rect.height) / (window.devicePixelRatio||1);
});
return state;
}
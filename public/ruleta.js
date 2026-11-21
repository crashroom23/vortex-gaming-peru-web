'use strict';
const get = id => document.getElementById(id);
const canvas = get('wheel');
const context = canvas.getContext('2d');
const status = get('status');
const form = get('spin');
const button = form.querySelector('button');
const colors = ['#593698','#852265','#2f478a','#176367','#67409a','#983e55','#3b5596','#385e41'];
let angle = 0;
let touched = false;

function draw(prizes) {
  const center = canvas.width / 2;
  const step = 2 * Math.PI / prizes.length;
  context.clearRect(0,0,canvas.width,canvas.height);
  for (const [index,label] of prizes.entries()) {
    const middle = index * step - Math.PI / 2;
    context.beginPath();
    context.moveTo(center,center);
    context.arc(center,center,center,middle-step/2,middle+step/2);
    context.fillStyle = colors[index];
    context.fill();
    context.save();
    context.translate(center,center);
    context.rotate(middle);
    context.font = 'bold 25px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#fff';
    context.fillText(label,205,0,185);
    context.restore();
  }
  context.beginPath();
  context.arc(center,center,34,0,2*Math.PI);
  context.fillStyle = '#ffdd78';
  context.fill();
}

async function request(body) {
  const response = await fetch('/api/roulette',body ? {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  return result;
}

draw(['Vortex','Ruleta','Vortex','Ruleta']);
request().then(({prizes}) => {
  if (!touched && prizes.length) draw(prizes);
}).catch(() => {
  if (!touched) status.textContent = 'La ruleta no está disponible en este momento.';
});

form.addEventListener('submit',async event => {
  event.preventDefault();
  if (button.disabled) return;
  touched = true;
  button.disabled = true;
  get('reward').hidden = true;
  status.textContent = 'Validando código…';
  try {
    const code = get('code').value.trim().toUpperCase();
    const result = await request({action:'spin',code});
    draw(result.prizes);
    const target = (360 - result.sector * 360 / result.prizes.length) % 360;
    const animate = !result.existing && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.style.transition = animate ? '' : 'none';
    angle += (animate ? 1800 : 0) + (target - angle % 360 + 360) % 360;
    canvas.style.transform = 'rotate(' + angle + 'deg)';
    status.textContent = 'Girando…';
    if (animate)
      await new Promise(resolve => setTimeout(resolve,4000));
    status.textContent = 'Resultado del código ' + code;
    get('prize').textContent = result.prize;
    get('coupon').value = result.coupon;
    get('reward').hidden = false;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

get('copy').addEventListener('click',async () => {
  const coupon = get('coupon');
  try {
    await navigator.clipboard.writeText(coupon.value);
    status.textContent = 'Cupón copiado.';
  } catch {
    coupon.focus();
    coupon.select();
  }
});

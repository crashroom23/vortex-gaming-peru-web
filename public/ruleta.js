'use strict';
const game = document.querySelector('.roulette-game');
const get = id => game.querySelector('#' + id);
const canvas = get('wheel');
const context = canvas.getContext('2d');
const status = get('status');
const form = get('spin');
const button = get('roulette-spin-button');
const colors = ['#fbaf32','#f3d246','#32baf6','#32c6a1','#f45875','#4cdbdf','#db66bc','#8660e8','#f48255','#90cf52','#7192ec','#c982e8'];
let angle = 0;
let touched = false;
let currentPrizes = [];
const options = get('roulette-options');
const detail = get('roulette-detail');
const reward = get('reward');
const sectorNumber = index => String(index + 1);

function showOption(index, showDetail = true) {
  if (button.disabled) return;
  for (const [position, option] of Array.from(options.querySelectorAll('button')).entries()) {
    option.setAttribute('aria-pressed', String(position === index));
  }
  detail.textContent = currentPrizes[index];
  detail.hidden = !showDetail;
}

function showWheel(prizes) {
  currentPrizes = prizes.map(label => label.replace(/ · (?:0 %|No disponible)$/, ''));
  draw(currentPrizes);
  options.replaceChildren(...currentPrizes.map((label,index) => {
    const option = document.createElement('button');
    option.type = 'button';
    const number = document.createElement('span');
    number.className = 'roulette-option-number';
    number.textContent = sectorNumber(index);
    number.style.setProperty('--sector-color', colors[index]);
    const description = document.createElement('span');
    description.textContent = label;
    option.append(number,description);
    option.setAttribute('aria-pressed', 'false');
    option.addEventListener('click', () => showOption(index,false));
    const item = document.createElement('li');
    item.append(option);
    return item;
  }));
  options.hidden = false;
  detail.hidden = true;
}

canvas.addEventListener('click', event => {
  if (!currentPrizes.length || button.disabled) return;
  const bounds = canvas.parentElement.getBoundingClientRect();
  const x = event.clientX - bounds.left - bounds.width / 2;
  const y = event.clientY - bounds.top - bounds.height / 2;
  const distance = Math.hypot(x,y);
  if (distance < bounds.width * .06 || distance > bounds.width / 2) return;
  const step = 360 / currentPrizes.length;
  const direction = Math.atan2(y,x) * 180 / Math.PI + 90 - angle;
  const normalized = ((direction + step / 2) % 360 + 360) % 360;
  showOption(Math.floor(normalized / step));
});

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
    context.strokeStyle = '#211632';
    context.lineWidth = 3;
    context.stroke();
    context.save();
    context.translate(center,center);
    context.rotate(middle);
    context.font = 'bold 38px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#191327';
    context.fillText(currentPrizes.length ? sectorNumber(index) : label,205,0,185);
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
request().then(({wheel}) => {
  if (!currentPrizes.length && wheel?.length) showWheel(wheel);
}).catch(() => {
  if (!touched) status.textContent = 'La ruleta no está disponible en este momento.';
});

form.addEventListener('submit',async event => {
  event.preventDefault();
  if (button.disabled) return;
  touched = true;
  button.disabled = true;
  button.textContent = '…';
  reward.close();
  status.textContent = 'Validando código…';
  try {
    const code = get('code').value.trim().toUpperCase();
    const result = await request({action:'spin',code});
    showWheel(result.prizes);
    const target = (360 - result.sector * 360 / result.prizes.length) % 360;
    const animate = !result.existing && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.style.transition = animate ? '' : 'none';
    angle += (animate ? 1800 : 0) + (target - angle % 360 + 360) % 360;
    canvas.style.transform = 'rotate(' + angle + 'deg)';
    status.textContent = 'Girando…';
    if (animate)
      await new Promise(resolve => setTimeout(resolve,4000));
    status.textContent = result.test ? 'Resultado de prueba, sin cupón canjeable.' : 'Resultado del código ' + code;
    get('prize').textContent = result.prize;
    get('coupon').value = result.coupon || '';
    get('roulette-coupon').hidden = !result.coupon;
    get('roulette-test-result').hidden = !result.test;
    if (!(game instanceof HTMLDialogElement) || game.open) reward.showModal();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Girar';
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

if (game instanceof HTMLDialogElement) {
  let opener;
  document.querySelectorAll('[data-open-roulette]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          typeof game.showModal !== 'function') return;
      event.preventDefault();
      opener = link;
      game.showModal();
    });
  });
  game.addEventListener('close', () => {
    if (opener?.getClientRects().length) opener.focus();
  });
}

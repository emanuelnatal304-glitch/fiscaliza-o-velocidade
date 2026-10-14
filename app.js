const $ = id => document.getElementById(id);
const T = window.APP_CONFIG.trecho;
let config = { url: window.APP_CONFIG.url, key: window.APP_CONFIG.key }, session = null, records = [], loaded = false;
try { config = JSON.parse(localStorage.getItem('fiscalizacao.config')) || config; } catch {}
$('url').value = config.url; $('key').value = config.key;
if (!config.url || !config.key) $('setup').open = true;
$('trecho').textContent = `${T.nome} · ${T.distanciaKm.toLocaleString('pt-BR')} km · limite ${T.limiteKmh} km/h`;
const fmt = v => v ? new Date(v).toLocaleString('pt-BR') : '—';
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function request(path, options = {}) {
 const headers = { apikey: config.key, 'Content-Type': 'application/json', ...options.headers };
 if (session) headers.Authorization = 'Bearer ' + session.access_token;
 let response;
 try { response = await fetch(config.url + path, { ...options, headers }); }
 catch { throw Error('Não foi possível conectar. Verifique a internet e a URL do projeto.'); }
 const data = await response.json().catch(() => null);
 if (!response.ok) {
  if (response.status === 401 && session) { clearSession(); throw Error('Sessão expirada. Entre novamente.'); }
  throw Error(data?.msg || data?.message || data?.error_description || 'Não foi possível concluir a operação.');
 }
 return data;
}
$('configuration').onsubmit = e => {
 e.preventDefault();
 try {
  const url = new URL($('url').value.trim()), key = $('key').value.trim();
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) throw Error('Informe a URL HTTPS do seu projeto Supabase.');
  if (key.startsWith('sb_secret_')) throw Error('Use a chave pública, nunca a chave secreta.');
  config = { url: url.origin, key }; localStorage.setItem('fiscalizacao.config', JSON.stringify(config));
  $('setup').open = false; message('Conexão configurada.');
 } catch (err) { message(err.message, true); }
};
$('login').onsubmit = async e => {
 e.preventDefault(); const button = e.submitter; button.disabled = true;
 try {
  session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('emailLogin').value.trim(), password: $('password').value }) });
  $('password').value = ''; $('access').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  $('account').textContent = session.user.email; $('moment').value = nowLocal(); await load(); message('Acesso autorizado.');
 } catch (err) { message(err.message, true); } finally { button.disabled = false; }
};
function clearSession() { session = null; records = []; loaded = false; render(); $('workspace').hidden = true; $('access').hidden = false; $('logout').hidden = true; }
$('logout').onclick = async () => { try { await request('/auth/v1/logout', { method: 'POST' }); clearSession(); message('Você saiu da conta.'); } catch (err) { message(err.message, true); } };
async function load() {
 loaded = false; $('report').disabled = true; const result = [];
 for (let offset = 0; ; offset += 500) {
  const page = await request('/rest/v1/medicoes?select=id,placa,entrada_em,saida_em,velocidade_kmh,infracao&order=entrada_em.desc,id.asc&limit=500&offset=' + offset);
  result.push(...page); if (page.length < 500) break;
 }
 records = result; loaded = true; $('report').disabled = false; render();
}
const status = r => !r.saida_em ? 'Em trânsito' : r.infracao ? 'Infração' : 'Regular';
function filtered() { const t = $('search').value.trim().toLocaleLowerCase('pt-BR'); return records.filter(r => (r.placa + ' ' + status(r)).toLocaleLowerCase('pt-BR').includes(t)); }
function render() {
 const list = filtered(); $('rows').replaceChildren(); $('count').textContent = list.length + ' registro(s)'; $('empty').hidden = !!list.length;
 list.forEach(r => {
  const tr = document.createElement('tr'), s = status(r);
  [r.placa, fmt(r.entrada_em), fmt(r.saida_em), r.velocidade_kmh == null ? '—' : Number(r.velocidade_kmh).toFixed(1).replace('.', ',') + ' km/h', s].forEach((v, i) => {
   const td = document.createElement('td'); td.textContent = v;
   if (i === 4) td.className = s === 'Infração' ? 'bad' : s === 'Regular' ? 'ok' : 'wait';
   tr.append(td);
  });
  $('rows').append(tr);
 });
}
$('search').oninput = render;
function readForm() {
 const placa = $('plate').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
 if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) throw Error('Placa inválida. Use ABC1234 ou ABC1D23.');
 if (!$('moment').value) throw Error('Informe a data e o horário.');
 return { placa, momento: new Date($('moment').value) };
}
async function run(button, action) {
 button.disabled = true;
 try { await action(); $('plate').value = ''; $('moment').value = nowLocal(); await load(); }
 catch (err) { message(err.message.includes('duplicate') ? 'Esta placa já tem uma entrada aberta.' : err.message, true); }
 finally { button.disabled = false; }
}
$('enter').onclick = () => run($('enter'), async () => {
 const { placa, momento } = readForm();
 if (records.some(r => r.placa === placa && !r.saida_em)) throw Error('Esta placa já tem uma entrada aberta.');
 await request('/rest/v1/medicoes', { method: 'POST', body: JSON.stringify({ placa, trecho: T.nome, distancia_km: T.distanciaKm, limite_kmh: T.limiteKmh, entrada_em: momento.toISOString() }) });
 message('Entrada registrada: ' + placa);
});
$('exit').onclick = () => run($('exit'), async () => {
 const { placa, momento } = readForm(), open = records.find(r => r.placa === placa && !r.saida_em);
 if (!open) throw Error('Não há entrada aberta para esta placa.');
 const horas = (momento - new Date(open.entrada_em)) / 3600000;
 if (horas <= 0) throw Error('A saída deve ser posterior à entrada.');
 const v = Math.round(T.distanciaKm / horas * 100) / 100;
 if (v > 300) throw Error('Velocidade de ' + v + ' km/h é implausível. Confira os horários.');
 const saved = await request('/rest/v1/medicoes?id=eq.' + encodeURIComponent(open.id), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ saida_em: momento.toISOString(), velocidade_kmh: v, infracao: v > T.limiteKmh }) });
 if (!saved?.length) throw Error('Registro não encontrado ou sem permissão.');
 message(`${placa}: média de ${String(v).replace('.', ',')} km/h (limite ${T.limiteKmh}). ` + (v > T.limiteKmh ? 'INFRAÇÃO.' : 'Regular.'), v > T.limiteKmh);
});
$('report').onclick = () => {
 if (!loaded) return message('Entre novamente para carregar os registros.', true);
 const l = filtered(); $('printMeta').textContent = `Relatório de fiscalização • ${T.nome} • ${new Date().toLocaleString('pt-BR')} • ${l.length} registro(s) • ${l.filter(r => r.infracao).length} infração(ões)`;
 window.print();
};

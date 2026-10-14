const list = document.querySelector('#map-list');
const base = './resources/maps/';

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function downloadMap(map, button, status) {
  button.disabled = true;
  const chunks = [];
  try {
    for (let index = 0; index < map.parts.length; index++) {
      const part = map.parts[index];
      status.textContent = `${index + 1}/${map.parts.length} 조각을 받는 중…`;
      const response = await fetch(base + part.filename);
      if (!response.ok) throw new Error(`${part.filename} 다운로드 실패: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== part.bytes) throw new Error(`${part.filename} 파일 크기가 다릅니다.`);
      status.textContent = `${index + 1}/${map.parts.length} 조각을 확인하는 중…`;
      const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (digest !== part.sha256) throw new Error(`${part.filename} 체크섬이 다릅니다.`);
      chunks.push(bytes);
    }
    const total = chunks.reduce((size, chunk) => size + chunk.byteLength, 0);
    if (total !== map.bytes) throw new Error('합친 파일 크기가 다릅니다.');
    const url = URL.createObjectURL(new Blob(chunks, { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = map.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = '검증 완료. 다운로드가 시작되었습니다. 아래 SHA-256으로 완성된 파일을 확인할 수 있습니다.';
  } catch (error) {
    status.textContent = `오류: ${error.message} 아래에서 조각을 개별로 받을 수 있습니다.`;
  } finally {
    button.disabled = false;
  }
}

function renderMap(map) {
  const card = document.createElement('section');
  card.className = 'panel resource-panel';
  const heading = document.createElement('div');
  heading.className = 'panel-top';
  const title = document.createElement('h2');
  title.textContent = map.name;
  heading.append(title);
  card.append(heading);
  const description = document.createElement('p');
  description.textContent = map.description;
  card.append(description);
  const meta = document.createElement('div');
  meta.className = 'map-meta';
  const size = document.createElement('span');
  size.textContent = `크기: ${formatBytes(map.bytes)} (${map.bytes.toLocaleString()}바이트)`;
  const hash = document.createElement('code');
  hash.textContent = `SHA-256: ${map.sha256}`;
  meta.append(size, hash);
  card.append(meta);
  const actions = document.createElement('div');
  actions.className = 'map-actions';
  const button = document.createElement('button');
  button.className = 'share-button';
  button.type = 'button';
  button.textContent = '맵 한 번에 받기 ↓';
  const status = document.createElement('span');
  status.className = 'map-status';
  status.setAttribute('role', 'status');
  button.addEventListener('click', () => downloadMap(map, button, status));
  actions.append(button, status);
  card.append(actions);
  const details = document.createElement('details');
  details.className = 'map-parts';
  const summary = document.createElement('summary');
  summary.textContent = `개별 조각 받기 (${map.parts.length}개)`;
  details.append(summary);
  const links = document.createElement('ul');
  for (const part of map.parts) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = base + part.filename;
    link.download = part.filename;
    link.textContent = part.filename;
    item.append(link);
    links.append(item);
  }
  details.append(links);
  card.append(details);
  return card;
}

try {
  const response = await fetch(base + 'manifest.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const maps = await response.json();
  list.replaceChildren(...maps.map(renderMap));
} catch (error) {
  list.textContent = `맵 목록을 불러오지 못했습니다: ${error.message}`;
}

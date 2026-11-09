// 在线体验页的「角色案例库」：21 位 LivLiv 精选角色，点开进角色库播放页。
// 角色素材由 LivLiv（livliv.ai）提供，非商业使用、须署名。
const grid = document.getElementById('cases-grid')
const count = document.getElementById('case-count')

function card(entry) {
  const a = document.createElement('a')
  a.className = 'case-card'
  a.href = '../public/livliv.html?id=' + encodeURIComponent(entry.id)
  a.title = entry.name + ' · 点开即演'
  const img = document.createElement('img')
  img.src = '../characters/cover/' + encodeURIComponent(entry.id) + '.webp'
  img.alt = entry.name
  img.loading = 'lazy'
  img.onerror = () => { img.style.visibility = 'hidden' }
  const name = document.createElement('span')
  name.className = 'case-name'
  name.textContent = entry.name
  a.append(img, name)
  return a
}

async function boot() {
  if (!grid) return
  try {
    const res = await fetch('../characters/index.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const list = await res.json()
    const characters = Array.isArray(list) ? list : []
    for (const c of characters) grid.append(card(c))
    if (count) count.textContent = characters.length + ' 位精选角色'
    if (!characters.length && count) count.textContent = '暂无角色'
  } catch (e) {
    if (count) count.textContent = '角色载入失败：' + (e?.message || e)
  }
}

boot()

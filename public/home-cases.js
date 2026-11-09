// 首页「角色案例库」：21 位 LivLiv 精选角色 + 本机工程，点开即演。
// 角色素材由 LivLiv（livliv.ai）提供，非商业使用、须署名。
const grid = document.getElementById('cases-grid')
const count = document.getElementById('case-count')

function card({ name, src, hint, href, tag }) {
  const a = document.createElement('a')
  a.className = 'case-card'
  a.href = href
  a.title = name + (hint ? ' · ' + hint : '')
  const img = document.createElement('img')
  img.src = src; img.alt = name; img.loading = 'lazy'
  img.onerror = () => { img.style.visibility = 'hidden' }
  const label = document.createElement('span')
  label.className = 'case-name'; label.textContent = name
  a.append(img, label)
  if (tag) {
    const t = document.createElement('span')
    t.className = 'case-tag'; t.textContent = tag
    a.append(t)
  }
  return a
}

async function boot() {
  if (!grid) return
  try {
    const [idx, proj] = await Promise.all([
      fetch('../characters/index.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }),
      fetch('/api/projects').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
    const characters = Array.isArray(idx) ? idx : []
    const all = Array.isArray(proj) ? proj : []
    // 大肥鱼只留主工程一个，其余实测工程在角色库侧栏里仍可切换
    const main = all.find((p) => p.id === 'da-fei-yu-1')
    const locals = main ? [main] : all.slice(0, 1)

    for (const c of characters) {
      grid.append(card({
        name: c.name,
        src: '../characters/cover/' + c.id + '.webp',
        hint: 'LivLiv 精选角色',
        href: 'livliv.html?id=' + encodeURIComponent(c.id),
      }))
    }
    for (const p of locals) {
      grid.append(card({
        name: p.name,
        src: 'cases/' + encodeURIComponent(p.id) + '.webp',
        hint: 'RuiC-2D 本机工程',
        href: 'livliv.html?local=' + encodeURIComponent(p.id),
        tag: '本机工程',
      }))
    }
    count.textContent = characters.length + ' 位精选角色 + ' + locals.length + ' 个本机工程'
    if (!characters.length && !locals.length) count.textContent = '没有找到角色'
  } catch (e) {
    count.textContent = '角色载入失败：' + (e?.message || e)
  }
}

boot()

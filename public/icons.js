export const paths={
 fish:'M3 13c2-8 13-10 16-3l3-3v10l-3-3C13 22 5 19 3 13Z M8 10h.01 M4 5l2 2 M10 3v2',
 upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',download:'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
 layers:'m3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5',folder:'M3 6h7l2 2h9v12H3Z',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 hidden:'m3 3 18 18M10 5h2c6 0 10 7 10 7s-1 2-3 4M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2',
 select:'m4 3 5 18 4-7 7-3Z',move:'M12 2v20M2 12h20m-14-6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',
 polygon:'m5 4 13-1 3 14-12 4-6-9Zm0 0v.01M18 3v.01M21 17v.01M9 21v.01',grid:'M3 3h18v18H3Zm6 0v18m6-18v18M3 9h18M3 15h18',
 play:'m8 4 13 8-13 8Z',pause:'M7 4h3v16H7Zm7 0h3v16h-3Z',stop:'M5 5h14v14H5Z',
 back:'M5 4v16m14-16L7 12l12 8Z',next:'M19 4v16M5 4l12 8-12 8Z',
 mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
 camera:'M3 6h12v12H3Zm12 4 6-4v12l-6-4',volume:'M3 9h4l5-5v16l-5-5H3Zm13-2c4 2 4 8 0 10m2-13c7 4 7 12 0 16',
 save:'M4 3h13l4 4v14H4Zm4 0v6h9V3M8 21v-8h9v8',undo:'m9 4-6 5 6 5M3 9h12a6 6 0 0 1 0 12',redo:'m15 4 6 5-6 5M21 9H9a6 6 0 0 0 0 12',
 plus:'M12 4v16M4 12h16',close:'m5 5 14 14M19 5 5 19',check:'m4 12 5 5L20 6',chevron:'m9 5 7 7-7 7',
 settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
 smile:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M7 13c2 5 8 5 10 0M8 9h.01M16 9h.01',
 expand:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',
 spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm8 0v4m-2-2h4',link:'m8 8 3-3c6-6 12 0 6 6l-2 2m-6-2-2 2c-6 6 0 12 6 6l3-3m-7-4 6-6',
 trash:'M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3M10 10v7m4-7v7',lock:'M6 10h12v11H6Zm2 0V6a4 4 0 1 1 8 0v4',
 info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10h.01',record:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',image:'M3 3h18v18H3Zm0 13 5-5 4 4 3-3 6 6M15 7h.01',copy:'M8 8h13v13H8ZM3 16V3h13',
 tail:'M4 3c7 2 8 8 8 11 0-3 1-9 8-11 3 10-1 15-8 18C5 18 1 13 4 3Z',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'
};
export function icon(name,size=18){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.layers}"/></svg>`;}

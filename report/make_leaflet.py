#!/usr/bin/env python3
"""Build a self-contained interactive Leaflet map of the NZ earthquake-catalogue inventory.
Reads report/map/footprints.json (produced by make_map.py) and writes
report/map/nz_catalogue_map.html (open in any browser; needs internet for tiles + Leaflet CDN)."""
import json, datetime

D = json.load(open("report/map/footprints.json"))
DATA = json.dumps(D, separators=(",", ":"))
n_reg = sum(1 for f in D["features"] if f["bbox"])
n_nat = sum(1 for f in D["features"] if f["scope"] == "nat")
n_off = sum(1 for f in D["features"] if f.get("point"))
built = "2026-06-19"

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Earthquake Catalogues of Aotearoa New Zealand, 1960-2026 - interactive map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
 integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
 integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  #map{position:absolute;top:0;bottom:0;left:0;right:0}
  .panel{background:rgba(255,255,255,.94);padding:10px 12px;border-radius:8px;
         box-shadow:0 1px 6px rgba(0,0,0,.3);font-size:12px;line-height:1.45;max-width:320px}
  .panel h1{font-size:14px;margin:0 0 4px}
  .panel .sub{color:#555;font-size:11px;margin-bottom:6px}
  .legend i{display:inline-block;width:12px;height:12px;margin-right:6px;opacity:.8;border:1px solid #0003;vertical-align:-1px}
  .legend div{margin:2px 0}
  details{margin-top:6px} summary{cursor:pointer;color:#26627f;font-weight:600}
  .natlist{max-height:160px;overflow:auto;font-size:11px;color:#333;margin-top:4px}
  .pop{font-size:12px;line-height:1.4;max-width:280px}
  .pop b{color:#222}.pop .meta{color:#666;font-style:italic}
  a{color:#1565a8}
  .leaflet-control-layers{font-size:12px}
</style></head>
<body><div id="map"></div>
<script>
const D = __DATA__;
const map = L.map('map',{minZoom:3,maxZoom:12,worldCopyJump:true}).setView([-41.0,174.0],5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {attribution:'&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
   subdomains:'abcd',maxZoom:19}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
const cats = D.categories;
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function doiLink(d){ if(!d) return '';
  let u = /^https?:/i.test(d)?d:(/^10\./.test(d)?'https://doi.org/'+d:'');
  return u?`<a href="${u}" target="_blank" rel="noopener">${esc(d)}</a>`:esc(d); }
function popup(f){
  let h=`<div class="pop"><b>${esc(f.name)}</b><br>`;
  const m=[f.type,f.detection].filter(Boolean).map(esc).join(' &middot; ');
  if(m) h+=`<span class="meta">${m}</span><br>`;
  const per=[f.start,f.end].filter(Boolean).join(' to '); if(per) h+=`<b>Period:</b> ${esc(per)}<br>`;
  if(f.region) h+=`<b>Region:</b> ${esc(f.region)}<br>`;
  if(f.doi) h+=`<b>DOI:</b> ${doiLink(f.doi)}`;
  return h+`</div>`;
}
const groups={}; for(const k in cats) groups[k]=L.layerGroup().addTo(map);
const natList=[];
D.features.forEach(f=>{
  const col=(cats[f.category]||{color:'#666'}).color;
  if(f.bbox){ const [W,E,S,N]=f.bbox;
    const r=L.rectangle([[S,W],[N,E]],{color:col,weight:1.2,fillColor:col,fillOpacity:0.12,opacity:0.85});
    r.bindPopup(popup(f));
    r.on('mouseover',()=>r.setStyle({fillOpacity:0.30,weight:2.2}));
    r.on('mouseout',()=>r.setStyle({fillOpacity:0.12,weight:1.2}));
    (groups[f.category]||Object.values(groups)[0]).addLayer(r);
  } else if(f.point){
    const m=L.circleMarker([f.point[0],f.point[1]],{radius:6,color:col,fillColor:col,fillOpacity:0.65,weight:1.5});
    m.bindPopup(popup(f)); (groups[f.category]||Object.values(groups)[0]).addLayer(m);
  } else if(f.scope==='nat'){ natList.push(f); }
});
// category toggle (top-right)
const overlays={};
for(const k in cats){ if(groups[k].getLayers().length)
  overlays[`<span style="color:${cats[k].color};font-size:14px">&#9632;</span> ${cats[k].label}`]=groups[k]; }
L.control.layers(null,overlays,{collapsed:false,position:'topright'}).addTo(map);
// title + national-catalogues panel (top-left)
const info=L.control({position:'topleft'}); info.onAdd=function(){
  const d=L.DomUtil.create('div','panel');
  let nat=natList.map(f=>`&bull; ${esc(f.name)}`).join('<br>');
  d.innerHTML=`<h1>Earthquake Catalogues of Aotearoa New Zealand</h1>
   <div class="sub">A curated inventory, 1960-2026 &middot; ${D.features.length} catalogues &middot; K. Graham, Earth Sciences NZ</div>
   Coloured boxes are each <b>regional</b> catalogue's representative footprint; click for details and DOI.
   Toggle types top-right.
   <details><summary>${natList.length} national / NZ-wide catalogues (whole country)</summary>
   <div class="natlist">${nat}</div></details>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d;
}; info.addTo(map);
// legend (bottom-right)
const leg=L.control({position:'bottomright'}); leg.onAdd=function(){
  const d=L.DomUtil.create('div','panel legend'); let h='<b>Catalogue type</b>';
  for(const k in cats){ if(groups[k].getLayers().length) h+=`<div><i style="background:${cats[k].color}"></i>${cats[k].label}</div>`; }
  h+='<div style="margin-top:5px;color:#777;font-size:10px">Footprints are indicative extents for discovery,<br>not precise data boundaries.</div>';
  d.innerHTML=h; return d;
}; leg.addTo(map);
</script></body></html>"""

html = TEMPLATE.replace("__DATA__", DATA)
open("report/map/nz_catalogue_map.html", "w").write(html)
print("wrote report/map/nz_catalogue_map.html (%d catalogues: %d regional boxes, %d offshore points, %d national)"
      % (len(D["features"]), n_reg, n_off, n_nat))

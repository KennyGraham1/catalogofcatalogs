#!/usr/bin/env python3
"""Spatial-coverage map of the NZ earthquake-catalogue inventory."""
import json, warnings
warnings.filterwarnings("ignore")
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Patch
import cartopy.crs as ccrs
import cartopy.feature as cfeature

DATA = json.load(open("report/inventory_data.json"))
CATORDER = ["national-operational","relocated-reprocessed","historical-macroseismic",
            "aftershock-response","temp-onshore","temp-offshore-obs",
            "volcano-geothermal-induced","slowslip-tremor-cmt","derived-synthetic-hazard"]
# traverse in the SAME order used to number entries (1..81)
entries = []
for k in CATORDER:
    for e in [x for x in DATA["catalogues"] if x["profile"].get("category")==k]:
        entries.append(e)

# ---- geocoding: index(1-based) -> (W,E,S,N,scope) ; scope: nat / reg / offN ----
GEO = {
 1:("nat",), 2:("nat",), 3:(176.5,179.5,-41.5,-37.5,"reg"), 4:("nat",), 5:("nat",),
 6:(175.5,177.0,-39.5,-38.0,"reg"), 7:(174.6,175.4,-41.6,-40.9,"reg"),
 8:(169.6,170.8,-43.8,-43.0,"reg"), 9:(169.4,171.0,-44.0,-42.8,"reg"), 10:("nat",),
 11:(168.7,171.5,-44.3,-42.4,"reg"), 12:("nat",),13:("nat",),14:("nat",),15:("nat",),16:("nat",),17:("nat",),
 18:(172.3,172.9,-43.7,-43.4,"reg"), 19:(176.6,177.2,-38.1,-37.7,"reg"),
 20:(166.0,167.6,-45.8,-44.8,"reg"), 21:(171.7,172.6,-43.7,-43.4,"reg"),
 22:(172.5,172.95,-43.65,-43.45,"reg"), 23:(172.7,173.4,-43.6,-43.0,"reg"),
 24:(168.8,169.5,-44.9,-44.4,"reg"), 25:(173.0,174.6,-42.8,-41.5,"reg"),
 26:(173.0,174.6,-42.8,-41.5,"reg"), 27:("offN",), 28:(177.8,178.8,-38.0,-37.2,"reg"),
 29:(171.4,172.0,-43.2,-42.8,"reg"), 30:(169.0,171.0,-44.2,-43.0,"reg"),
 31:(170.2,170.6,-43.4,-43.1,"reg"), 32:(167.5,169.8,-46.5,-45.3,"reg"),
 33:(175.0,176.6,-39.2,-38.0,"reg"), 34:(173.8,174.5,-39.5,-39.1,"reg"),
 35:(177.7,178.5,-38.7,-38.0,"reg"), 36:(167.5,169.0,-45.5,-44.5,"reg"),
 37:(170.0,170.7,-46.1,-45.7,"reg"), 38:(176.3,177.2,-40.0,-39.0,"reg"),
 39:(176.5,179.5,-39.3,-37.5,"reg"), 40:(176.5,179.5,-39.3,-37.5,"reg"),
 41:(178.9,179.3,-35.05,-34.7,"reg"), 42:(177.5,179.5,-39.3,-38.2,"reg"),
 43:(175.55,175.8,-39.2,-39.0,"reg"), 44:(176.3,176.6,-38.2,-38.0,"reg"),
 45:(175.7,176.1,-39.0,-38.6,"reg"), 46:(175.7,176.1,-39.0,-38.6,"reg"),
 47:(175.7,176.1,-39.0,-38.6,"reg"), 48:(175.8,176.8,-38.8,-38.0,"reg"),
 49:(176.4,176.6,-38.25,-38.05,"reg"), 50:(176.3,176.55,-38.35,-38.15,"reg"),
 51:(175.5,175.65,-39.35,-39.2,"reg"), 52:(177.1,177.25,-37.55,-37.45,"reg"),
 53:(176.15,176.3,-38.62,-38.5,"reg"), 54:(176.15,176.3,-38.68,-38.55,"reg"),
 55:(176.2,176.85,-38.45,-38.0,"reg"), 56:(176.15,176.3,-38.68,-38.55,"reg"),
 57:(176.05,176.2,-38.72,-38.58,"reg"), 58:(175.55,175.62,-39.32,-39.25,"reg"),
 59:(174.6,175.0,-37.1,-36.7,"reg"), 60:("offN",), 61:(175.6,175.8,-39.18,-39.0,"reg"),
 62:(174.4,175.3,-37.2,-36.5,"reg"), 63:("nat",), 64:(176.0,179.5,-42.0,-37.5,"reg"),
 65:(177.5,179.0,-38.5,-37.3,"reg"), 66:(175.0,176.5,-40.8,-39.8,"reg"),
 67:(169.5,170.8,-44.0,-43.0,"reg"), 68:(169.3,171.0,-44.2,-42.9,"reg"),
 69:(175.8,176.5,-39.5,-39.0,"reg"), 70:(177.5,178.6,-38.3,-37.5,"reg"),
 71:(173.5,178.0,-42.5,-38.5,"reg"), 72:(169.5,171.5,-46.5,-44.5,"reg"),
 73:(176.5,179.5,-39.3,-37.5,"reg"), 74:(177.5,180.0,-41.5,-37.5,"reg"),
 75:(175.0,176.5,-40.5,-39.5,"reg"), 76:("nat",),77:("nat",),78:("nat",),79:("nat",),
 80:("nat",), 81:("nat",),
}

CATLABEL = {
 "national-operational":"National / network","relocated-reprocessed":"Relocated / reprocessed",
 "historical-macroseismic":"Historical / macroseismic","aftershock-response":"Aftershock response",
 "temp-onshore":"Temporary onshore","temp-offshore-obs":"Offshore / OBS",
 "volcano-geothermal-induced":"Volcano / geothermal","slowslip-tremor-cmt":"Slow-slip / tremor / CMT",
 "derived-synthetic-hazard":"Derived / synthetic / hazard"}
CATCOLOR = {
 "national-operational":"#222222","relocated-reprocessed":"#1f77b4","historical-macroseismic":"#8c564b",
 "aftershock-response":"#d62728","temp-onshore":"#2ca02c","temp-offshore-obs":"#17becf",
 "volcano-geothermal-induced":"#ff7f0e","slowslip-tremor-cmt":"#9467bd","derived-synthetic-hazard":"#7f7f7f"}

EXT = [165, 180, -48, -34]
proj = ccrs.PlateCarree()

# ---- load faults (optional, simplified) ----
faults = None
try:
    import geopandas as gpd
    gdf = gpd.read_file("public/data/nz-active-faults.geojson")
    gdf["geometry"] = gdf.geometry.simplify(0.01)
    faults = gdf
    print("faults loaded:", len(gdf))
except Exception as ex:
    print("faults load skipped:", str(ex)[:80])

def base(ax, faint_faults=True):
    ax.set_extent(EXT, crs=proj)
    try: ax.add_feature(cfeature.NaturalEarthFeature("physical","ocean","10m"), facecolor="#eef4f8", edgecolor="none", zorder=0)
    except Exception: ax.set_facecolor("#eef4f8")
    try: ax.add_feature(cfeature.NaturalEarthFeature("physical","land","10m"), facecolor="#f6f3ec", edgecolor="none", zorder=1)
    except Exception: pass
    if faults is not None:
        faults.plot(ax=ax, transform=proj, linewidth=0.25, edgecolor="#b07a5a", alpha=0.55, zorder=2)
    ax.coastlines("10m", linewidth=0.6, color="#444", zorder=3)
    gl = ax.gridlines(draw_labels=True, linewidth=0.3, color="#bbb", alpha=0.6, zorder=2)
    gl.top_labels = gl.right_labels = False
    gl.xlabel_style = gl.ylabel_style = {"size":8, "color":"#444"}

# gather regional footprints
regional = []   # (W,E,S,N,category)
nat_count = 0; offN = []
for i, e in enumerate(entries, start=1):
    g = GEO.get(i); cat = e["profile"]["category"]
    if not g: continue
    if g[0]=="nat": nat_count += 1
    elif g[0]=="offN": offN.append(e["profile"]["name"])
    else:
        W,E,S,N,_ = g; regional.append((W,E,S,N,cat))

# ---- dump geocoded footprints (feeds the interactive Leaflet map) ----
import os, re
def _cf(s):
    s=(s or "").strip()
    return "" if (not s or s.lower().startswith("unknown") or "not documented" in s.lower()) else s
OFFPT={"Kermadec 2021":[-29.7,-177.8],"Monowai":[-25.9,177.2]}
feats=[]
for i,e in enumerate(entries,start=1):
    p=e["profile"]; g=GEO.get(i,("nat",)); sc=g[0]
    bbox=[g[0],g[1],g[2],g[3]] if sc not in ("nat","offN") else None
    pt=None
    if sc=="offN":
        for k,v in OFFPT.items():
            if k.lower() in p["name"].lower(): pt=v
    feats.append({"i":i,"name":p["name"],"category":p.get("category",""),"scope":sc,
        "bbox":bbox,"point":pt,"start":_cf(p.get("start_date")),"end":_cf(p.get("end_date")),
        "doi":(p.get("doi") or "").strip(),"type":_cf(p.get("catalogue_type")),
        "detection":_cf(p.get("detection_method")),"region":_cf(p.get("region"))})
os.makedirs("report/map",exist_ok=True)
json.dump({"categories":{k:{"label":CATLABEL[k],"color":CATCOLOR[k]} for k in CATORDER},
           "features":feats},
          open("report/map/footprints.json","w"))
print("wrote report/map/footprints.json (%d features)"%len(feats))

fig, (axA, axB) = plt.subplots(1,2, figsize=(13.2,8.4), subplot_kw={"projection":proj})
fig.subplots_adjust(left=0.04,right=0.97,top=0.92,bottom=0.06,wspace=0.12)
for ax in (axA, axB): ax.set_rasterization_zorder(5)   # rasterize backdrop+heatmap, keep boxes/text vector

# ---------- Panel (a): footprints by category ----------
base(axA)
# draw larger boxes first so small ones sit on top
for W,E,S,N,cat in sorted(regional, key=lambda r:-( (r[1]-r[0])*(r[3]-r[2]) )):
    c = CATCOLOR[cat]
    axA.add_patch(Rectangle((W,S), E-W, N-S, transform=proj, facecolor=c, edgecolor=c,
                            alpha=0.16, lw=0.7, zorder=5))
    axA.add_patch(Rectangle((W,S), E-W, N-S, transform=proj, facecolor="none", edgecolor=c,
                            alpha=0.9, lw=0.7, zorder=6))
# geographic labels
for txt,x,y,r in [("North\nIsland",175.2,-38.9,0),("South\nIsland",170.0,-44.3,0),
                  ("Taupo VZ",177.25,-38.5,0),("Hikurangi\nmargin",179.0,-40.3,0),
                  ("Alpine Fault",168.4,-43.7,0),("Canterbury",173.6,-43.6,0),
                  ("Fiordland",165.7,-45.6,0),("Auckland",174.0,-36.8,0),("Kaikoura",174.8,-42.2,0)]:
    axA.text(x,y,txt,fontsize=8,style="italic",color="#33485c",ha="center",va="center",transform=proj,zorder=8)
# offshore-north annotation
axA.text(179.6,-34.4,"Kermadec arc:\nMonowai, Kermadec 2021\n(offshore, N of map)",fontsize=7.5,color="#444",
         ha="right",va="top",transform=proj,zorder=8,bbox=dict(boxstyle="round,pad=0.3",fc="white",ec="#bbb",alpha=0.85))
axA.set_title("(a) Catalogue footprints by type", fontsize=13, loc="left")
# legend
present = [c for c in CATORDER if any(r[4]==c for r in regional)]
handles = [Patch(facecolor=CATCOLOR[c], edgecolor=CATCOLOR[c], alpha=0.5, label=CATLABEL[c]) for c in present]
leg = axA.legend(handles=handles, loc="upper left", fontsize=8, frameon=True, framealpha=0.9,
                 title=f"Category (regional footprints)\n+{nat_count} national/NZ-wide catalogues span full extent",
                 title_fontsize=8)
leg._legend_box.align="left"

# ---------- Panel (b): regional coverage density ----------
base(axB)
dx=0.1
xe=np.arange(EXT[0],EXT[1]+dx,dx); ye=np.arange(EXT[2],EXT[3]+dx,dx)
grid=np.zeros((len(ye)-1,len(xe)-1))
xc=(xe[:-1]+xe[1:])/2; yc=(ye[:-1]+ye[1:])/2
XX,YY=np.meshgrid(xc,yc)
for W,E,S,N,cat in regional:
    mask=(XX>=W)&(XX<=E)&(YY>=S)&(YY<=N)
    grid[mask]+=1
gm=np.ma.masked_where(grid==0,grid)
pc=axB.pcolormesh(xe,ye,gm,transform=proj,cmap="YlOrRd",alpha=0.78,zorder=4,
                  vmin=1,vmax=max(2,int(grid.max())))
axB.set_title("(b) Regional catalogue overlap (spatial density)", fontsize=13, loc="left")
# inset colorbar (top-left) so panel (b)'s map stays the same size as panel (a)
cax = axB.inset_axes([0.05, 0.50, 0.028, 0.34])
cb = fig.colorbar(pc, cax=cax)
cb.ax.tick_params(labelsize=8)
axB.text(0.066, 0.86, "regional\ncatalogues\nper cell", transform=axB.transAxes,
         fontsize=7.6, va="bottom", ha="left", color="#333", zorder=9)

fig.suptitle("Spatial coverage of the Aotearoa New Zealand earthquake-catalogue inventory (81 catalogues, 1960–2026)",
             fontsize=14, y=0.975)
import os
os.makedirs("report/figures", exist_ok=True)
fig.savefig("report/figures/nz_catalogue_coverage.pdf", bbox_inches="tight", dpi=250)
fig.savefig("report/figures/nz_catalogue_coverage.png", dpi=200, bbox_inches="tight")
print("wrote report/figures/nz_catalogue_coverage.{pdf,png}")
print(f"regional footprints: {len(regional)} | national: {nat_count} | offshore-N: {len(offN)} | max overlap: {int(grid.max())}")

#!/usr/bin/env node
// Packs data/graph.json into data/graph.bin: typed-array sections behind a small JSON header.
// The routing function reads this on every cold start, and parsing 47 MB of JSON cost ~5 s.
// Views over a Buffer cost nothing, so the same data loads in milliseconds.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const g = JSON.parse(await readFile(path.join(ROOT, "data/graph.json"), "utf8"));
if (g.meta.format !== 2) throw new Error("expected graph format 2");
const N = g.nodes.length, E = g.edges.length;
const NB = g.sunKeys?.length ?? 0;

const nodes = new Int32Array(N * 2);
for (let i = 0; i < N; i++) { nodes[i * 2] = Math.round(g.nodes[i][0] * 1e6); nodes[i * 2 + 1] = Math.round(g.nodes[i][1] * 1e6); }

const ea = new Int32Array(E), eb = new Int32Array(E), elen = new Uint32Array(E);
const ehw = new Uint8Array(E), eshelter = new Uint8Array(E), eflags = new Uint16Array(E);
const gOff = new Uint32Array(E + 1), nOff = new Uint32Array(E + 1);
let pts = 0, nameLen = 0;
const enc = new TextEncoder();
const nameBufs = [];
for (let i = 0; i < E; i++) {
  const [a, b, len, hw, shelter, flags, name, interior] = g.edges[i];
  ea[i] = a; eb[i] = b; elen[i] = len; ehw[i] = hw; eshelter[i] = shelter; eflags[i] = flags;
  gOff[i] = pts; pts += (interior || []).length;
  const nb = name ? enc.encode(name) : new Uint8Array(0);
  nameBufs.push(nb); nOff[i] = nameLen; nameLen += nb.length;
}
gOff[E] = pts; nOff[E] = nameLen;

const gPts = new Int32Array(pts * 2);
let k = 0;
for (let i = 0; i < E; i++) for (const p of g.edges[i][7] || []) { gPts[k++] = Math.round(p[0] * 1e6); gPts[k++] = Math.round(p[1] * 1e6); }
const names = new Uint8Array(nameLen);
let no = 0; for (const nb of nameBufs) { names.set(nb, no); no += nb.length; }
const sun = g.sunBytes ? new Uint8Array(Buffer.from(g.sunBytes, "base64")) : new Uint8Array(0);

// every section starts on an 8-byte boundary so the typed-array views are legal
const ALIGN = 8;
const pad = (n) => (ALIGN - (n % ALIGN)) % ALIGN;
const parts = [];
let off = 0;
const put = (name, arr) => {
  const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  parts.push({ name, off, len: b.length, buf: b });
  off += b.length;
  const p = pad(off);
  if (p) { parts.push({ name: null, off, len: p, buf: Buffer.alloc(p) }); off += p; }
};
put("nodes", nodes); put("ea", ea); put("eb", eb); put("elen", elen); put("ehw", ehw); put("eshelter", eshelter); put("eflags", eflags);
put("gOff", gOff); put("gPts", gPts); put("nOff", nOff); put("names", names); put("sun", sun);

const header = { version: 1, meta: g.meta, hwTable: g.hwTable, wcTable: g.wcTable, sunKeys: g.sunKeys ?? [], counts: { N, E, NB, pts }, nodeAttr: g.nodeAttr, pois: g.pois, sections: Object.fromEntries(parts.filter((p) => p.name).map((p) => [p.name, { off: p.off, len: p.len }])) };
let headerBuf = Buffer.from(JSON.stringify(header), "utf8");
// pad the header too, so the first section is aligned relative to the file start
headerBuf = Buffer.concat([headerBuf, Buffer.alloc(pad(4 + headerBuf.length))]);
const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(headerBuf.length, 0);
const out = Buffer.concat([lenBuf, headerBuf, ...parts.map((p) => p.buf)]);
await writeFile(path.join(ROOT, "data/graph.bin"), out);
console.log(`graph.bin ${(out.length / 1e6).toFixed(1)} MB — header ${(headerBuf.length / 1e6).toFixed(1)} MB, ${N} nodes, ${E} edges, ${pts} interior points, ${NB} sun buckets`);

#!/usr/bin/env node
/** Real-WebGL regression for #1060. Requires synced private world assets and
 * Playwright Chromium (or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH). No API calls.
 * Screenshots/measurements go to the supplied directory; nothing is deleted. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(
  process.argv[2] ?? `${root}/node_modules/.cache/crypt-lighting-check`
);
await mkdir(output, { recursive: true });

// A deliberately floorless specimen: floor pools must not masquerade as lit
// model pixels. Use the real composition -> WorldPropModel -> GLTF path and
// the same DungeonEnvironment/light resolver that preview and play consume.
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head>
<body style="margin:0;background:#383b40"><div id="root" style="width:600px;height:500px"></div>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { DungeonEnvironment } from '/src/components/session/DungeonEnvironment.tsx';
import { buildDungeonLightingFacts } from '/src/rendering/dungeonLighting.ts';
const params = new URLSearchParams(location.search);
const asset = params.get('asset');
const sourceRef = params.get('source');
const composition = {
 id: 'lighting-specimen', worldId: 'lighting-regression',
 json: JSON.stringify({kind: 'rpg-world-building-scene', version: 1, scene: {
  version: 1, id: 'lighting-scene', name: 'Dark textured prop', groups: [],
  items: [{id: 'specimen', kind: 'prop', assetRef: 'dnd5e:props:dark-fortress:' + asset,
    label: asset, transform: {x: 0, y: 0, z: 0, rotationY: asset === 'cage_03' ? -2.087120422285414 : 0}}]
 }})
};
const lighting = buildDungeonLightingFacts(['0,0,0'], [{id:'crypt',archetype:'crypt',intensity:.35,cellKeys:['0,0,0']}],
 sourceRef ? [{key:'nearby-source', ref:sourceRef, cellKey:'0,0,0', groundedPosition:[1.3,0,1.3]}] : []);
const scene = {exits:[], floorTiles:new Map(), wallRuns:[], doorGaps:[], archetypes:['crypt'], lighting,
 props:[{id:composition.id,ref:'composition:props:'+composition.id,position:{x:0,y:0,z:0},facing:'',offset:{x:0,y:0,z:0}}]};
const source = {worldId:composition.worldId,reader:{getComposition:async()=>composition}};
const h = React.createElement;
function Probe() {
 const state=useThree();
 React.useLayoutEffect(()=>{state.camera.lookAt(0,.65,0);state.invalidate();window.lightingState=state;},[state]);
 return null;
}
createRoot(document.getElementById('root')).render(h(Canvas,{orthographic:true,frameloop:'demand',dpr:1,
 gl:{preserveDrawingBuffer:true},camera:{position:[3,2.8,4],zoom:250,near:.1,far:100}},
 h(React.Suspense,{fallback:null},h(DungeonEnvironment,{scene,focus:{x:0,z:0},hexSize:1,compositionSource:source})),h(Probe)));
</script></body></html>`;

const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [
    {
      name: 'crypt-lighting-regression',
      configureServer(server) {
        server.middlewares.use(
          '/__crypt-lighting-check',
          async (_req, res, next) => {
            try {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                await server.transformIndexHtml('/__crypt-lighting-check', html)
              );
            } catch (error) {
              next(error);
            }
          }
        );
      },
    },
  ],
});
let browser;
const samples = [];
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  for (const asset of ['torture_device_01', 'cage_03']) {
    for (const [kind, source] of [
      ['dim', ''],
      ['warm', 'dnd5e:props:brazier'],
      ['cool', 'dnd5e:props:glowing-orb'],
    ]) {
      const query = new URLSearchParams({ asset, source });
      await page.goto(
        `http://127.0.0.1:${server.httpServer.address().port}/__crypt-lighting-check?${query}`
      );
      await page.waitForFunction(
        () =>
          window.lightingState?.scene
            .getObjectByName('composition-placement-lighting-specimen')
            ?.getObjectByProperty('isMesh', true),
        null,
        { timeout: 30000 }
      );
      const pixels = await page.evaluate(async () => {
        const { gl, scene, camera } = window.lightingState;
        await gl.compileAsync(scene, camera);
        gl.setClearColor('#383b40', 0);
        gl.render(scene, camera);
        const context = gl.getContext();
        const buffer = new Uint8Array(
          gl.domElement.width * gl.domElement.height * 4
        );
        context.readPixels(
          0,
          0,
          gl.domElement.width,
          gl.domElement.height,
          context.RGBA,
          context.UNSIGNED_BYTE,
          buffer
        );
        const values = [],
          rgb = [0, 0, 0];
        for (let i = 0; i < buffer.length; i += 4) {
          if (buffer[i + 3] < 250) continue; // opaque model pixels only, not background/antialiasing
          values.push(
            0.2126 * buffer[i] + 0.7152 * buffer[i + 1] + 0.0722 * buffer[i + 2]
          );
          for (let channel = 0; channel < 3; channel++)
            rgb[channel] += buffer[i + channel];
        }
        values.sort((a, b) => a - b);
        return {
          count: values.length,
          median: values[Math.floor(values.length * 0.5)],
          p90: values[Math.floor(values.length * 0.9)],
          blackFraction:
            values.filter((value) => value < 5).length / values.length,
          meanRgb: rgb.map((value) => value / values.length),
        };
      });
      samples.push({ asset, kind, ...pixels });
      await page.screenshot({ path: resolve(output, `${asset}-${kind}.png`) });
    }
  }
  await writeFile(
    resolve(output, 'measurements.json'),
    JSON.stringify({ samples, errors }, null, 2) + '\n'
  );
  assert.deepEqual(
    errors,
    [],
    'Browser, shader, or resource errors invalidate the visual check'
  );
  for (const asset of ['torture_device_01', 'cage_03']) {
    const [dim, warm, cool] = samples.filter(
      (sample) => sample.asset === asset
    );
    // Broad visual bounds, not exact image hashes: catch a black silhouette,
    // missing model, or lost point-light response while allowing GPU variation.
    for (const sample of [dim, warm, cool])
      assert.ok(
        sample.count > 3000,
        `${asset}/${sample.kind}: model is missing or clipped`
      );
    assert.ok(
      dim.median > 5 && dim.p90 > 10 && dim.blackFraction < 0.5,
      `${asset}: dim lighting crushes most of the model to black (${JSON.stringify(dim)})`
    );
    assert.ok(
      warm.meanRgb[0] > dim.meanRgb[0] + 1,
      `${asset}: warm source no longer lights the material`
    );
    assert.ok(
      cool.meanRgb[2] > dim.meanRgb[2] + 1,
      `${asset}: cool source no longer lights the material`
    );
  }
  console.log(`Crypt lighting visual regression passed. Evidence: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}

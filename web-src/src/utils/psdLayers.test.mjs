// Plain-node self-check, no test framework — run with: node web-src/src/utils/psdLayers.test.mjs
import assert from 'node:assert/strict'
import { flattenLayers } from './psdLayers.mjs'

const manifest = [
  { id: 1, name: 'background', type: 'layer' }, // no bounds -> excluded
  {
    id: 2,
    name: 'group',
    type: 'layerSection',
    bounds: { top: 0, left: 0, width: 100, height: 100 }, // v1 shape
    children: [
      {
        id: 3,
        name: 'title',
        type: 'textLayer',
        bounds: { top: 10, left: 10, right: 90, bottom: 30 }, // v2 shape
        thumbnail: { mediaType: 'image/png', url: 'https://example.com/thumb.png' } // v2 shape
      },
      { id: 4, name: 'no-bounds-child', type: 'layer' }
    ]
  }
]

const flat = flattenLayers(manifest)

assert.deepEqual(flat.map(l => l.id), [2, 3], 'keeps only layers with bounds, in tree order')
assert.deepEqual(flat.map(l => l.depth), [0, 1], 'tracks nesting depth for indentation')
assert.deepEqual(flat[0].bounds, { left: 0, top: 0, width: 100, height: 100 }, 'v1 {left,top,width,height} bounds pass through')
assert.deepEqual(flat[1].bounds, { left: 10, top: 10, width: 80, height: 20 }, 'v2 {left,top,right,bottom} bounds normalize to width/height')
assert.equal(flat[1].thumbnail, 'https://example.com/thumb.png', 'v2 {mediaType,url} thumbnail normalizes to a plain URL string')
assert.equal(flattenLayers([]).length, 0, 'empty input -> empty output')
assert.equal(flattenLayers(undefined).length, 0, 'undefined input -> empty output')

console.log('psdLayers.test.mjs: all assertions passed')

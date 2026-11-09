const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { placeTooltip, svgAxisFont } = require('../lib/cockpit/placeTooltip');

test('a tooltip follows the cursor and flips instead of shrinking', () => {
  const near = placeTooltip({
    cursorX: 40, cursorY: 30, viewportWidth: 1280, viewportHeight: 800,
    tipWidth: 100, tipHeight: 40,
  });
  assert.equal(near.left, 40 + 12);
  assert.equal(near.top, 30 + 12);
  assert.equal(near.width, 100);
  assert.equal(near.flippedX, false);

  const edge = placeTooltip({
    cursorX: 1200, cursorY: 740, viewportWidth: 1280, viewportHeight: 800,
    tipWidth: 360, tipHeight: 80,
  });
  assert.equal(edge.flippedX, true);
  assert.equal(edge.flippedY, true);
  assert.equal(edge.left, 1200 - 12 - 360);
  assert.equal(edge.top, 740 - 12 - 80);
  assert.equal(edge.width, 360);

  const units = svgAxisFont(12, 720, 1140);
  assert.ok(Math.abs(units * (1140 / 720) - 12) < 0.01);

  const css = fs.readFileSync(path.join(__dirname, '../app/cockpit/cockpit.css'), 'utf8');
  assert.match(css, /\.chart-tip, \.ov-tip \{[^}]*white-space: nowrap/);
  assert.match(css, /\.chart-tip, \.ov-tip \{[^}]*width: max-content/);
  assert.equal(css.includes('.chart-tip { position: absolute; z-index: 6; margin: 0; max-width: 240px'), false);
  const helperUsers = ['app/cockpit/ui/OverviewScreen.js', 'app/cockpit/ui/ForecastScreen.js', 'app/cockpit/ui/charts.js']
    .map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  for (const source of helperUsers) assert.match(source, /CursorTooltip|usePlacedTooltip/);
  const helper = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/CursorTooltip.js'), 'utf8');
  assert.match(helper, /placeTooltip/);
  assert.match(helper, /createPortal/);
});

test('a tip taller than its host still follows the cursor', () => {
  const hostHeight = 132;
  const tipHeight = 344;
  assert.ok(tipHeight > hostHeight);
  const high = placeTooltip({
    cursorX: 200, cursorY: 180, viewportWidth: 1280, viewportHeight: 800,
    tipWidth: 240, tipHeight,
  });
  const moved = placeTooltip({
    cursorX: 200, cursorY: 211, viewportWidth: 1280, viewportHeight: 800,
    tipWidth: 240, tipHeight,
  });
  assert.equal(high.top, 192);
  assert.notEqual(high.top, 0);
  assert.equal(moved.top - high.top, 31);
  assert.ok(high.top + tipHeight < 800);
  assert.equal(high.width, 240);
  const css = fs.readFileSync(path.join(__dirname, '../app/cockpit/cockpit.css'), 'utf8');
  assert.match(css, /\.cursor-tip \{[^}]*position: fixed/);
  const helper = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/CursorTooltip.js'), 'utf8');
  assert.match(helper, /createPortal/);
  assert.match(helper, /document\.body/);
});

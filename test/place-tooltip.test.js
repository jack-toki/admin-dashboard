const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { placeTooltip } = require('../lib/cockpit/placeTooltip');

test('a tooltip follows the cursor and flips instead of shrinking', () => {
  const near = placeTooltip({
    cursorX: 40, cursorY: 30, hostLeft: 0, hostTop: 0, hostWidth: 400, hostHeight: 300,
    tipWidth: 100, tipHeight: 40,
  });
  assert.equal(near.left, 40 + 12);
  assert.equal(near.top, 30 + 12);
  assert.equal(near.width, 100);
  assert.equal(near.flippedX, false);

  const edge = placeTooltip({
    cursorX: 360, cursorY: 240, hostLeft: 0, hostTop: 0, hostWidth: 400, hostHeight: 300,
    tipWidth: 360, tipHeight: 80,
  });
  assert.equal(edge.flippedX, true);
  assert.equal(edge.flippedY, true);
  assert.equal(edge.left, 0);
  assert.equal(edge.top, 148);
  assert.equal(edge.width, 360);

  const css = fs.readFileSync(path.join(__dirname, '../app/cockpit/cockpit.css'), 'utf8');
  assert.match(css, /\.chart-tip, \.ov-tip \{[^}]*white-space: nowrap/);
  assert.match(css, /\.chart-tip, \.ov-tip \{[^}]*width: max-content/);
  assert.equal(css.includes('.chart-tip { position: absolute; z-index: 6; margin: 0; max-width: 240px'), false);
  const helperUsers = ['app/cockpit/ui/OverviewScreen.js', 'app/cockpit/ui/ForecastScreen.js', 'app/cockpit/ui/charts.js']
    .map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  for (const source of helperUsers) assert.match(source, /CursorTooltip|usePlacedTooltip/);
  const helper = fs.readFileSync(path.join(__dirname, '../app/cockpit/ui/CursorTooltip.js'), 'utf8');
  assert.match(helper, /placeTooltip/);
});

var MiniMap = require('../src/minimap');
var minimapElement = window.minimapElement = new MiniMap(document.body,
  {
    fadeHover: true,
    allowClick: false,
    hoverOpacity: 0
  });
minimapElement.show();

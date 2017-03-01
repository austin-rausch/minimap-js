/*! The MIT License (MIT)

Copyright (c) 2014 Prince John Wesley <princejohnwesley@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

**/
'use strict';
const {
  width,
  height,
  isNumeric,
  isFunction,
  selectAll,
  // select,
  remove,
  // hasClass,
  addClass,
  removeClass,
  cssObjAssign,
  cloneNode,
  outerHeight,
  showElement,
  hideElement,
  toggleElement
  } = require('./jquery-ports');

function minimap (baseElement, options) {
  let fn = function () {};
  let shown = true;

  const defaults = {
    heightRatio: 0.6,
    widthRatio: 0.05,
    offsetHeightRatio: 0.035,
    offsetWidthRatio: 0.035,
    position: 'right',
    touch: true,
    smoothScroll: true,
    smoothScrollDelay: 200,
    onPreviewChange: fn,
    disableFind: false
  };

  const settings = Object.assign({}, defaults, options);
  const position = ['right', 'left'];

  // when invoked, this function prevents browsers from finding (ctrl-f)
  // text located in the minimap
  function disableFind (elements) {
    elements.forEach((element) => {
      var newHTML = '';                             // create a new blank string
      var stop = false;                             // boolean to toggle whether we're in a tag or not
      var currentElement = element;                 // variable to hold the current element
      var html = currentElement.innerHTML;          // get html from current element
      for (var i = 0; i < html.length; i++) {       // iterate through each character of the html
        newHTML += html[i];                         // insert current character into newHTML
        if (html[i] === '<') { stop = true; }       // stop when entering a tag
        if (html[i] === '>') { stop = false; }      // continue when exiting a tag
        if (stop === false) {                       // inject dot into newHTML
          newHTML += '<span style="position:absolute; right:-999999999px;">' + '.' + '</span>';
        }
        if (html[i] === ' ') {
          newHTML += ' ';
        }
      }
      currentElement.innerHTML = newHTML;           // replace current element with newHTML
    });
  }

  function validateProp (prop, value) {
    switch (prop) {
      case 'disableFind':
        if (value !== true && value !== false) {
          throw new Error('Invalid disableFind: ' + value);
        }
        break;
      case 'heightRatio':
        var heightRatio = value;
        if (!isNumeric(heightRatio) || heightRatio <= 0.0 || heightRatio > 1.0) {
          throw new Error('Invalid heightRatio: ' + heightRatio);
        }
        break;
      case 'widthRatio':
        var widthRatio = value;
        if (!isNumeric(widthRatio) || widthRatio <= 0.0 || widthRatio > 0.5) {
          throw new Error('Invalid widthRatio: ' + widthRatio);
        }
        break;
      case 'offsetHeightRatio':
        var offsetHeightRatio = value;
        if (!isNumeric(offsetHeightRatio) || offsetHeightRatio < 0.0 || offsetHeightRatio > 0.9) {
          throw new Error('Invalid offsetHeightRatio: ' + offsetHeightRatio);
        }
        break;
      case 'offsetWidthRatio':
        var offsetWidthRatio = value;
        if (!isNumeric(offsetWidthRatio) || offsetWidthRatio < 0.0 || offsetWidthRatio > 0.9) {
          throw new Error('Invalid offsetWidthRatio: ' + offsetWidthRatio);
        }
        break;
      case 'position':
        var p = value.toLowerCase();
        var pos = position.indexOf(p);
        if (pos === -1) {
          throw new Error('Invalid position: ' + settings.position);
        }
        settings.position = p;
        break;
      case 'smoothScrollDelay':
        var smoothScrollDelay = value;
        if (((smoothScrollDelay | 0) !== smoothScrollDelay) || smoothScrollDelay < 4) {
          throw new Error('Invalid smoothScrollDelay(in ms): ' + smoothScrollDelay);
        }
        break;
      case 'touch':
      case 'smoothScroll':
        break;
      case 'onPreviewChange':
        var fn = value;
        if (!fn || !isFunction(fn)) {
          throw new Error('Invalid onPreviewChange: ' + value);
        }
        break;
      default:
        throw new Error('Invalid validation property: ' + prop);
    }
  }

  // validate inputs
  for (var prop in settings) {
    validateProp(prop, settings[prop]);
  }

  var miniElement = cloneNode(baseElement);

  remove(selectAll('.minimap .noselect', miniElement));
  remove(selectAll('.miniregion', miniElement));

  addClass(miniElement, 'minimap noselect');

  var miniChildren, current;

  if (settings.disableFind === true) {
    miniChildren = miniElement.children;
    for (var i = 0; i < miniChildren.length; i++) {
      current = miniChildren[i];
      addClass(current, 'unsearchable');
    }
  }

  // remove events & customized cursors
  miniChildren = miniElement.children;
  for (var j = 0; j < miniChildren.length; j++) {
    current = miniChildren[j];
    cssObjAssign(current, {'pointer-events': 'none'});
  }

  var region = document.createElement('div');
  addClass(region, 'miniregion');
  var body = document.body;
  body.appendChild(region);
  body.appendChild(miniElement);

  disableFind(selectAll('.unsearchable'));

  function scale () {
    return {
      x: (width(window) / width(baseElement)) * settings.widthRatio,
      y: (height(window) / height(baseElement)) * settings.heightRatio
    };
  }

  function onResizeHandler (e) {
    if (!shown) {
      return;
    }

    var s = scale();
    var sc = 'scale(' + s.x + ',' + s.y + ')';
    var offsetTop = height(window) * settings.offsetHeightRatio;

    var offsetLeftRight = width(window) * settings.offsetWidthRatio;

    var top = height(baseElement) * (s.y - 1) / 2 + offsetTop;
    var leftRight = width(baseElement) * (s.x - 1) / 2 + offsetLeftRight;

    var thisWidth = width(window) * (1 / s.x) * settings.widthRatio;
    var thisHeight = height(window) * (1 / s.y) * settings.heightRatio;

    var css = {
      '-webkit-transform': sc,
      '-moz-transform': sc,
      '-ms-transform': sc,
      '-o-transform': sc,
      'transform': sc,
      'top': top + 'px',
      'width': thisWidth + 'px',
      'height': thisHeight + 'px',
      'margin': '0px',
      'padding': '0px'
    };

    css[settings.position] = leftRight + 'px';

    cssObjAssign(miniElement, css);

    var regionTop = baseElement.offsetTop * s.y;

    var cssRegion = {
      width: width(miniElement) + 'px',
      height: height(window) * s.y + 'px',
      margin: '0px',
      top: window.scrollY * s.y + offsetTop - regionTop + 'px'
    };

    cssRegion[settings.position] = offsetLeftRight + 'px';
    cssObjAssign(region, cssRegion);
    settings.onPreviewChange(miniElement, s);
  }

  function onScrollHandler (e) {
    if (!shown) {
      return;
    }

    var s = scale();
    var offsetTop = height(window) * settings.offsetHeightRatio;
    var top = baseElement.offsetTop * s.y;
    var pos = window.scrollY * s.y;
    var regionHeight = outerHeight(region);
    var bottom = outerHeight(baseElement) * s.y + top;

    if (pos + regionHeight + offsetTop < top || pos > bottom) {
      cssObjAssign(region, {display: 'none'});
    } else {
      cssObjAssign(region, {top: offsetTop + pos + 'px', display: 'block'});
    }
  }

  function scrollTop (e) {
    if (!shown) {
      return;
    }

    var s = scale();
    var offsetTop = height(window) * settings.offsetHeightRatio;
    var top = baseElement.offsetTop * s.y;
    var regionHeight = outerHeight(region);// region.outerHeight(true); // mark!
    var target = (e.clientY - regionHeight / 2 - offsetTop + top) / s.y;

    if (e.type === 'click' && settings.smoothScroll) {
      var current = window.scrollY;
      var maxTarget = outerHeight(baseElement); // minimap.outerHeight(true); // mark!
      target = Math.max(target, Math.min(target, maxTarget));
      var direction = target > current;
      var delay = settings.smoothScrollDelay;
      var distance = Math.abs(current - target);
      var r = delay / distance;
      var unitScroll = 1;
      var unitDelay = 4;
      if (r >= 4) {
        unitDelay = parseInt(unitScroll);
      } else if (r >= 1) {
        unitScroll = parseInt(r) * 4;
      } else {
        unitScroll = (4 / r);
      }

      var next = current;
      var count = parseInt(distance / unitScroll);
      onSmoothScroll = true;

      // linear translate
      var smoothScroll = function () {
        next = next + (direction ? unitScroll : -unitScroll);
        if (--count <= 0) {
          clearInterval(timer);
          onSmoothScroll = false;
          next = target;
        }
        var curScrollX = window.scrollX;
        window.scrollTo(curScrollX, next);
      };

      var timer = window.setInterval(smoothScroll, unitDelay);
    } else {
      var curScrollX = window.scrollX;
      window.scrollTo(curScrollX, target);
    }
    e.stopPropagation();
  }

  var mousedown = false;
  var onSmoothScroll = false;

  function onMouseupHandler (e) {
    mousedown = false;
    removeClass(baseElement, 'noselect');
    removeClass(region, 'dragging');
  }

  function onMousemoveHandler (e) {
    if (!mousedown || onSmoothScroll) {
      return;
    }
    scrollTop(e);
  }

  function onClickHandler (e) {
    scrollTop(e);
    mousedown = false;
  }

  function onMousedownHandler (e) {
    mousedown = true;
    addClass(baseElement, 'noselect');
    addClass(region, 'dragging');
  }

  onResizeHandler();

  window.addEventListener('resize', onResizeHandler);
  window.addEventListener('scroll', onScrollHandler);

  document.addEventListener('mouseup', onMouseupHandler);
  document.addEventListener('mousemove', onMousemoveHandler);

  region.addEventListener('mousedown', onMousedownHandler);
  region.addEventListener('mouseup', onMouseupHandler);
  region.addEventListener('mousemove', onMousemoveHandler);
  region.addEventListener('click', onClickHandler);

  miniElement.addEventListener('mousedown', onMousedownHandler);
  miniElement.addEventListener('mouseup', onMouseupHandler);
  miniElement.addEventListener('mousemove', onMousemoveHandler);
  miniElement.addEventListener('click', onClickHandler);

  var lastTouchType = '';
  function touchHandler (e) {
    var touches = e.changedTouches;

    if (touches.length > 1) {
      return;
    }

    var touch = touches[0];
    var events = ['touchstart', 'touchmove', 'touchend'];
    var mouseEvents = ['mousedown', 'mousemove', 'mouseup'];
    var ev = events.indexOf(e.type);

    if (ev === -1) {
      return;
    }

    var type = mouseEvents[ev];
    if (e.type === events[2] && lastTouchType === events[0]) {
      type = 'click';
    }

    var simulatedEvent = document.createEvent('MouseEvent');
    simulatedEvent.initMouseEvent(type, true, true, window, 1,
          touch.screenX, touch.screenY,
          touch.clientX, touch.clientY, false,
          false, false, false, 0, null);
    touch.target.dispatchEvent(simulatedEvent);
    e.preventDefault();
    lastTouchType = e.type;
  }

  if (settings.touch) {
    document.addEventListener('touchstart', touchHandler, true);
    document.addEventListener('touchmove', touchHandler, true);
    document.addEventListener('touchend', touchHandler, true);
    document.addEventListener('touchcancel', touchHandler, true);
  }

  function setPosition (pos) {
    var oldValue = settings.position;
    validateProp('position', pos);
    if (oldValue !== settings.position) {
      var css = {};
      css[oldValue] = '';
      onResizeHandler();
      cssObjAssign(region, css);
      cssObjAssign(miniElement, css);
    }
  }

  function setProperty (propName, redraw) {
    return function (value) {
      validateProp(propName, value);
      settings[propName] = value;
      if (redraw) onResizeHandler();
    };
  }

  function show () {
    if (shown) {
      return;
    }
    showElement(miniElement);
    showElement(region);
    shown = true;
    onResizeHandler();
  }

  function hide () {
    if (!shown) {
      return;
    }
    hideElement(miniElement);
    hideElement(region);
    shown = false;
  }

  function toggle () {
    toggleElement(miniElement);
    toggleElement(region);
    shown = !shown;
    if (shown) onResizeHandler();
  }

  return Object.assign({}, this, {
    'setPosition': setPosition,
    'setHeightRatio': setProperty('heightRatio', true),
    'setWidthRatio': setProperty('widthRatio', true),
    'setOffsetHeightRatio': setProperty('offsetHeightRatio', true),
    'setOffsetWidthRatio': setProperty('offsetWidthRatio', true),
    'setSmoothScroll': setProperty('smoothScroll'),
    'setSmoothScrollDelay': setProperty('smoothScrollDelay'),
    'show': show,
    'hide': hide,
    'toggle': toggle
  });
}

module.exports = minimap;

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

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('./jquery-ports'),
    width = _require.width,
    height = _require.height,
    isNumeric = _require.isNumeric,
    isFunction = _require.isFunction,
    selectAll = _require.selectAll,
    remove = _require.remove,
    addClass = _require.addClass,
    removeClass = _require.removeClass,
    cssObjAssign = _require.cssObjAssign,
    cloneNode = _require.cloneNode,
    outerHeight = _require.outerHeight,
    showElement = _require.showElement,
    hideElement = _require.hideElement,
    toggleElement = _require.toggleElement;

var validPositions = new Set(['right', 'left']);

var noop = function noop() {};

var propValidators = {
  'allowClick': function allowClick(value) {
    if (value !== true && value !== false) {
      throw new Error('Invalid allowClick: ' + value);
    }
  },
  'fadeHover': function fadeHover(value) {
    if (value !== true && value !== false) {
      throw new Error('Invalid fadeHover: ' + value);
    }
  },
  'hoverOpacity': function hoverOpacity(value) {
    if (!isNumeric(value) || value <= 0.0 || value > 1.0) {
      throw new Error('Invalid hoverOpacity: ' + value);
    }
  },
  'disableFind': function disableFind(value) {
    if (value !== true && value !== false) {
      throw new Error('Invalid disableFind: ' + value);
    }
  },
  'heightRatio': function heightRatio(value) {
    if (!isNumeric(value) || value <= 0.0 || value > 1.0) {
      throw new Error('Invalid heightRatio: ' + value);
    }
  },
  'widthRatio': function widthRatio(value) {
    if (!isNumeric(value) || value <= 0.0 || value > 0.5) {
      throw new Error('Invalid widthRatio: ' + value);
    }
  },
  'offsetHeightRatio': function offsetHeightRatio(value) {
    if (!isNumeric(value) || value < 0.0 || value > 0.9) {
      throw new Error('Invalid offsetHeightRatio: ' + value);
    }
  },
  'offsetWidthRatio': function offsetWidthRatio(value) {
    if (!isNumeric(value) || value < 0.0 || value > 0.9) {
      throw new Error('Invalid offsetWidthRatio: ' + value);
    }
  },
  'position': function position(value) {
    if (!validPositions.has(value)) {
      throw new Error('Invalid position: ' + value);
    }
  },
  'smoothScrollDelay': function smoothScrollDelay(value) {
    if ((value | 0) !== value || value < 4) {
      throw new Error('Invalid smoothScrollDelay(in ms): ' + value);
    }
  },
  'touch': function touch(value) {},
  'smoothScroll': function smoothScroll(value) {},
  'onPreviewChange': function onPreviewChange(value) {
    if (!value || !isFunction(value)) {
      throw new Error('Invalid onPreviewChange: ' + value);
    }
  }
};

var minimap = function () {
  function minimap(baseElement, options) {
    _classCallCheck(this, minimap);

    this.baseElement = baseElement;
    this.shown = false;
    this.mousedown = false;
    this.onSmoothScroll = false;
    this.lastTouchType = '';

    var defaults = {
      allowClick: true,
      fadeHover: false,
      hoverOpacity: 0.4,
      heightRatio: 0.6,
      widthRatio: 0.05,
      offsetHeightRatio: 0.035,
      offsetWidthRatio: 0.035,
      position: 'right',
      touch: true,
      smoothScroll: true,
      smoothScrollDelay: 200,
      onPreviewChange: noop,
      disableFind: false
    };

    var settings = this.settings = Object.assign({}, defaults, options);
    settings.position = settings.position.toLowerCase();

    this._validateProps(settings);
    console.log(settings);
    var miniElement = this.miniElement = cloneNode(baseElement);

    remove(selectAll('.minimap .noselect', miniElement));
    remove(selectAll('.miniregion', miniElement));

    addClass(miniElement, 'minimap noselect');

    var miniChildren = miniElement.children;
    var current = void 0;

    if (settings.disableFind === true) {
      for (var i = 0; i < miniChildren.length; i++) {
        current = miniChildren[i];
        addClass(current, 'unsearchable');
      }
    }

    for (var _i = 0; _i < miniChildren.length; _i++) {
      current = miniChildren[_i];
      cssObjAssign(current, { 'pointer-events': 'none' });
    }

    var region = this.region = document.createElement('div');
    addClass(region, 'miniregion');

    var body = document.body;
    body.appendChild(region);
    body.appendChild(miniElement);
    console.log(region);
    this._disableFind(selectAll('.unsearchable'));

    var onScrollHandler = this.onScrollHandler = this._genOnScrollHandler();
    var onResizeHandler = this.onResizeHandler = this._genOnResizeHandler();

    onResizeHandler();

    window.addEventListener('resize', onResizeHandler);
    window.addEventListener('scroll', onScrollHandler);

    if (settings.allowClick) {
      var onMouseUpHandler = this.onMouseUpHandler = this._genOnMouseUpHandler();
      var onMouseMoveHandler = this.onMouseMoveHandler = this._genOnMouseMoveHandler();
      var onMouseDownHandler = this.onMouseDownHandler = this._genOnMouseDownHandler();
      var onClickHandler = this.onClickHandler = this._genOnClickHandler();

      document.addEventListener('mouseup', onMouseUpHandler);
      document.addEventListener('mousemove', onMouseMoveHandler);

      region.addEventListener('mousedown', onMouseDownHandler);
      region.addEventListener('mouseup', onMouseUpHandler);
      region.addEventListener('mousemove', onMouseMoveHandler);
      region.addEventListener('click', onClickHandler);

      miniElement.addEventListener('mousedown', onMouseDownHandler);
      miniElement.addEventListener('mouseup', onMouseUpHandler);
      miniElement.addEventListener('mousemove', onMouseMoveHandler);
      miniElement.addEventListener('click', onClickHandler);
    }

    if (settings.touch) {
      var touchHandler = this.touchHandler = this._genTouchHandler();
      document.addEventListener('touchstart', touchHandler, true);
      document.addEventListener('touchmove', touchHandler, true);
      document.addEventListener('touchend', touchHandler, true);
      document.addEventListener('touchcancel', touchHandler, true);
    }

    if (settings.fadeHover) {
      console.log('adding fade on hover listeners');
      var opacity = this.settings.hoverOpacity;
      miniElement.addEventListener('mouseover', function () {
        console.log('mouse over');
        miniElement.style.opacity = '' + opacity;
        miniElement.style.filter = 'alpha(opacity=' + opacity * 100 + ')';
        region.style.opacity = '' + opacity;
        region.style.filter = 'alpha(opacity=' + opacity * 100 + ')';
      });
      miniElement.addEventListener('mouseout', function () {
        console.log('mouse out');
        miniElement.style.opacity = null;
        miniElement.style.filter = null;
        region.style.opacity = null;
        region.style.filter = null;
      });
    }
  }

  _createClass(minimap, [{
    key: '_genOnResizeHandler',
    value: function _genOnResizeHandler() {
      var _this = this;

      return function (e) {
        if (!_this.shown) {
          return;
        }
        var settings = _this.settings;
        var scale = _this._scale();
        var scaleCssString = 'scale(' + scale.x + ',' + scale.y + ')';

        var offsetTop = height(window) * settings.offsetHeightRatio;
        var offsetLeftRight = width(window) * settings.offsetWidthRatio;

        var top = height(_this.baseElement) * (scale.y - 1) / 2 + offsetTop;
        var leftRight = width(_this.baseElement) * (scale.x - 1) / 2 + offsetLeftRight;

        var thisWidth = width(window) * (1 / scale.x) * settings.widthRatio;
        var thisHeight = height(window) * (1 / scale.y) * settings.heightRatio;

        var miniElementCss = {
          '-webkit-transform': scaleCssString,
          '-moz-transform': scaleCssString,
          '-ms-transform': scaleCssString,
          '-o-transform': scaleCssString,
          'transform': scaleCssString,
          'top': top + 'px',
          'width': thisWidth + 'px',
          'height': thisHeight + 'px',
          'margin': '0px',
          'padding': '0px'
        };
        miniElementCss[settings.position] = leftRight + 'px';

        var regionTop = _this.baseElement.offsetTop * scale.y;
        var regionElementCss = {
          width: width(_this.miniElement) + 'px',
          height: height(window) * scale.y + 'px',
          margin: '0px',
          top: window.scrollY * scale.y + offsetTop - regionTop + 'px'
        };
        regionElementCss[_this.settings.position] = offsetLeftRight + 'px';

        cssObjAssign(_this.region, regionElementCss);

        cssObjAssign(_this.miniElement, miniElementCss);

        _this.settings.onPreviewChange(_this.miniElement, scale);
      };
    }
  }, {
    key: '_genOnScrollHandler',
    value: function _genOnScrollHandler() {
      var _this2 = this;

      return function (e) {
        if (!_this2.shown) {
          return;
        }
        var scale = _this2._scale();
        var offsetTop = height(window) * _this2.settings.offsetHeightRatio;
        var top = _this2.baseElement.offsetTop * scale.y;
        var pos = window.scrollY * scale.y;
        var regionHeight = outerHeight(_this2.region);
        var bottom = outerHeight(_this2.baseElement) * scale.y + top;

        if (pos + regionHeight + offsetTop < top || pos > bottom) {
          cssObjAssign(_this2.region, { display: 'none' });
        } else {
          cssObjAssign(_this2.region, { top: offsetTop + pos + 'px', display: 'block' });
        }
      };
    }
  }, {
    key: '_genOnMouseUpHandler',
    value: function _genOnMouseUpHandler() {
      var _this3 = this;

      return function (e) {
        _this3.mousedown = false;
        removeClass(_this3.baseElement, 'noselect');
        removeClass(_this3.region, 'dragging');
      };
    }
  }, {
    key: '_genOnMouseMoveHandler',
    value: function _genOnMouseMoveHandler() {
      var _this4 = this;

      return function (e) {
        if (!_this4.mousedown || _this4.onSmoothScroll) {
          return;
        }
        _this4.scrollTop(e);
      };
    }
  }, {
    key: '_genOnMouseDownHandler',
    value: function _genOnMouseDownHandler() {
      var _this5 = this;

      return function (e) {
        _this5.mousedown = true;
        addClass(_this5.baseElement, 'noselect');
        addClass(_this5.region, 'dragging');
      };
    }
  }, {
    key: '_genOnClickHandler',
    value: function _genOnClickHandler() {
      var _this6 = this;

      return function (e) {
        _this6.scrollTop(e);
        _this6.mousedown = false;
      };
    }
  }, {
    key: '_genTouchHandler',
    value: function _genTouchHandler() {
      var _this7 = this;

      return function (e) {
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
        if (e.type === events[2] && _this7.lastTouchType === events[0]) {
          type = 'click';
        }

        var simulatedEvent = document.createEvent('MouseEvent');
        simulatedEvent.initMouseEvent(type, true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
        touch.target.dispatchEvent(simulatedEvent);
        e.preventDefault();
        _this7.lastTouchType = e.type;
      };
    }
  }, {
    key: 'scrollTop',
    value: function scrollTop(e) {
      if (!this.shown) {
        return;
      }

      var scale = this._scale();
      var offsetTop = height(window) * this.settings.offsetHeightRatio;
      var top = this.baseElement.offsetTop * scale.y;
      var regionHeight = outerHeight(this.region);

      var target = (e.clientY - regionHeight / 2 - offsetTop + top) / scale.y;

      if (e.type === 'click' && this.settings.smoothScroll) {
        var _current = window.scrollY;
        var maxTarget = outerHeight(this.baseElement); // minimap.outerHeight(true); // mark!
        target = Math.max(target, Math.min(target, maxTarget));
        var direction = target > _current;
        var delay = this.settings.smoothScrollDelay;
        var distance = Math.abs(_current - target);
        var r = delay / distance;
        var unitScroll = 1;
        var unitDelay = 4;

        this.onSmoothScroll = false;
        if (r >= 4) {
          unitDelay = parseInt(unitScroll);
        } else if (r >= 1) {
          unitScroll = parseInt(r) * 4;
        } else {
          unitScroll = 4 / r;
        }

        var next = _current;
        var count = parseInt(distance / unitScroll);
        this.onSmoothScroll = true;

        // linear translate
        var smoothScroll = function smoothScroll() {
          next = next + (direction ? unitScroll : -unitScroll);
          if (--count <= 0) {
            clearInterval(timer);
            this.onSmoothScroll = false;
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
  }, {
    key: '_disableFind',
    value: function _disableFind(elements) {
      elements.forEach(function (element) {
        var newHTML = '';
        var stop = false;
        var currentElement = element;
        var html = currentElement.innerHTML;
        for (var i = 0; i < html.length; i++) {
          newHTML += html[i];
          if (html[i] === '<') {
            stop = true;
          }
          if (html[i] === '>') {
            stop = false;
          }
          if (stop === false) {
            newHTML += '<span style="position:absolute; right:-999999999px;">' + '.' + '</span>';
          }
          if (html[i] === ' ') {
            newHTML += ' ';
          }
        }
        currentElement.innerHTML = newHTML;
      });
    }
  }, {
    key: '_validateProps',
    value: function _validateProps(props) {
      var keys = Object.keys(props);
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = keys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var key = _step.value;

          var validator = propValidators[key];
          if (validator) {
            validator(props[key]);
          } else {
            throw new Error('Invalid validation property: ' + props[key]);
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }, {
    key: '_scale',
    value: function _scale() {
      return {
        x: width(window) / width(this.baseElement) * this.settings.widthRatio,
        y: height(window) / height(this.baseElement) * this.settings.heightRatio
      };
    }
  }, {
    key: 'setPosition',
    value: function setPosition(position) {
      var oldValue = this.settings.position;
      var validator = propValidators['position'];
      validator(position);
      this.settings.position = position;
      if (oldValue !== this.settings.position) {
        var css = {};
        css[oldValue] = '';
        this.onResizeHandler();
        cssObjAssign(this.region, css);
        cssObjAssign(this.miniElement, css);
      }
    }
  }, {
    key: '_genSetPropertyFunction',
    value: function _genSetPropertyFunction(prop, redraw) {
      var _this8 = this;

      return function (value) {
        var validator = propValidators[prop];
        validator(prop, value);
        _this8.settings[prop] = value;
        if (redraw) {
          _this8.onResizeHandler();
        }
      };
    }
  }, {
    key: 'show',
    value: function show() {
      if (!this.shown) {
        showElement(this.miniElement);
        showElement(this.region);
        this.shown = true;
        this.onResizeHandler();
      }
    }
  }, {
    key: 'hide',
    value: function hide() {
      if (this.shown) {
        hideElement(this.miniElement);
        hideElement(this.region);
        this.shown = false;
      }
    }
  }, {
    key: 'toggle',
    value: function toggle() {
      toggleElement(this.miniElement);
      toggleElement(this.region);
      this.shown = !this.shown;
      if (this.shown) {
        this.onResizeHandler();
      }
    }
  }]);

  return minimap;
}();

module.exports = minimap;
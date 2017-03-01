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
  remove,
  addClass,
  removeClass,
  cssObjAssign,
  cloneNode,
  outerHeight,
  showElement,
  hideElement,
  toggleElement
  } = require('./jquery-ports');

const validPositions = new Set(['right', 'left']);
const redrawAttributes = new Set(
  [
    'heightRatio',
    'widthRatio',
    'offsetHeightRatio',
    'offsetWidthRatio'
  ]
);

const noop = () => {};

const propValidators = {
  'allowClick': (value) => {
    if (value !== true && value !== false) {
      throw new Error('Invalid allowClick: ' + value);
    }
  },
  'fadeHover': (value) => {
    if (value !== true && value !== false) {
      throw new Error('Invalid fadeHover: ' + value);
    }
  },
  'hoverOpacity': (value) => {
    if (!isNumeric(value) || value < 0.0 || value > 1.0) {
      throw new Error('Invalid hoverOpacity: ' + value);
    }
  },
  'hoverFadeSpeed': (value) => {
    if (!isNumeric(value) || value < 0.0) {
      throw new Error('Invalid hoverFadeSpeed: ' + value);
    }
  },
  'disableFind': (value) => {
    if (value !== true && value !== false) {
      throw new Error('Invalid disableFind: ' + value);
    }
  },
  'heightRatio': (value) => {
    if (!isNumeric(value) || value <= 0.0 || value > 1.0) {
      throw new Error('Invalid heightRatio: ' + value);
    }
  },
  'widthRatio': (value) => {
    if (!isNumeric(value) || value <= 0.0 || value > 0.5) {
      throw new Error('Invalid widthRatio: ' + value);
    }
  },
  'offsetHeightRatio': (value) => {
    if (!isNumeric(value) || value < 0.0 || value > 0.9) {
      throw new Error('Invalid offsetHeightRatio: ' + value);
    }
  },
  'offsetWidthRatio': (value) => {
    if (!isNumeric(value) || value < 0.0 || value > 0.9) {
      throw new Error('Invalid offsetWidthRatio: ' + value);
    }
  },
  'position': (value) => {
    if (!validPositions.has(value)) {
      throw new Error('Invalid position: ' + value);
    }
  },
  'smoothScrollDelay': (value) => {
    if (((value | 0) !== value) || value < 4) {
      throw new Error('Invalid smoothScrollDelay(in ms): ' + value);
    }
  },
  'touch': (value) => {
  },
  'smoothScroll': (value) => {
  },
  'onPreviewChange': (value) => {
    if (!value || !isFunction(value)) {
      throw new Error('Invalid onPreviewChange: ' + value);
    }
  }
};

class MiniMap {
  /**
   * constructor
   *
   * @param  {Element} baseElement The element to clone
   * @param  {Object} options      Object containing the desired options
   * @return {MiniMap}             The minimap class to control the new element
   */
  constructor (baseElement, options) {
    this.baseElement = baseElement;
    this.shown = false; // if the element is currentlt shown
    this.mousedown = false; // if the mouse is down (I.E. dragging)
    this.onSmoothScroll = false; // if smooth scroll is currently happening
    this.lastTouchType = ''; // the last touch type received

    const defaults = {
      allowClick: true,
      fadeHover: false,
      hoverOpacity: 0.4,
      hoverFadeSpeed: 0.5,
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

    const settings = this.settings = Object.assign({}, defaults, options);
    settings.position = settings.position.toLowerCase();

    // will throw error if any props are invalid
    this._validateProps(settings);

    // clone the element and remove any other minimap elements on the page
    const miniElement = this.miniElement = cloneNode(baseElement);

    remove(selectAll('.minimap .noselect', miniElement));
    remove(selectAll('.miniregion', miniElement));

    addClass(miniElement, 'minimap noselect');

    const miniChildren = miniElement.children;
    let current;

    // if disable find is true, add class 'unsearchable'
    // as a flag for disableFind function
    if (settings.disableFind === true) {
      for (let i = 0; i < miniChildren.length; i++) {
        current = miniChildren[i];
        addClass(current, 'unsearchable');
      }
    }

    // all the children should ignore pointer events
    for (let i = 0; i < miniChildren.length; i++) {
      current = miniChildren[i];
      cssObjAssign(current, {'pointer-events': 'none'});
    }

    // the region element is the square representing the viewport
    const region = this.region = document.createElement('div');
    addClass(region, 'miniregion');

    // add the minielement and region to the page
    const body = document.body;
    body.appendChild(region);
    body.appendChild(miniElement);

    // disable all elements flagged as unsearchable
    this._disableFind(selectAll('.unsearchable'));

    // generate handlers
    const onScrollHandler = this.onScrollHandler = this._genOnScrollHandler();
    const onResizeHandler = this.onResizeHandler = this._genOnResizeHandler();

    onResizeHandler();

    window.addEventListener('resize', onResizeHandler);
    window.addEventListener('scroll', onScrollHandler);

    // if we are allowing clicks on the element generate and add event handlers
    if (settings.allowClick) {
      const onMouseUpHandler = this.onMouseUpHandler = this._genOnMouseUpHandler();
      const onMouseMoveHandler = this.onMouseMoveHandler = this._genOnMouseMoveHandler();
      const onMouseDownHandler = this.onMouseDownHandler = this._genOnMouseDownHandler();
      const onClickHandler = this.onClickHandler = this._genOnClickHandler();

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

      // only add pointer if click is enabled, otherwise would be confusing
      miniElement.style.cursor = 'pointer';
      region.style.cursor = 'pointer';
    }

    // do we have touch support?
    if (settings.touch) {
      const touchHandler = this.touchHandler = this._genTouchHandler();
      document.addEventListener('touchstart', touchHandler, true);
      document.addEventListener('touchmove', touchHandler, true);
      document.addEventListener('touchend', touchHandler, true);
      document.addEventListener('touchcancel', touchHandler, true);
    }

    // are we changing opacity on hover?
    if (settings.fadeHover) {
      const fadeSpeed = this.settings.hoverFadeSpeed;

      miniElement.style.transition = `opacity ${fadeSpeed}s`;
      region.style.transition = `opacity ${fadeSpeed}s`;

      const mouseOver = this.onMouseOverHandler = this._genMouseOverHandler();
      const mouseOut = this.onMouseOutHandler = this._genMouseOutHandler();

      miniElement.addEventListener('mouseover', mouseOver);
      miniElement.addEventListener('mouseout', mouseOut);

      region.addEventListener('mouseover', mouseOver);
      region.addEventListener('mouseout', mouseOut);
    }

    // add setters to the Object, this is more concise.
    const setters = [
      'heightRatio',
      'widthRatio',
      'offsetHeightRatio',
      'offsetWidthRatio',
      'smoothScroll',
      'smoothScrollDelay'
    ];
    this.addSetters(setters);
  }

  /**
   * addSetters - Will add a setter function to this class for each
   * string in setters
   *
   * @param  {Array} setters description
   */
  addSetters (setters) {
    setters.forEach((setter) => {
      // capitalize the first letter, E.G. heightRatio => HeightRatio
      const setterCapitalized = setter.substring(0, 1).toUpperCase() + setter.substring(1);
      // does this setter require redrawing the element
      if (redrawAttributes.has(setter)) {
        this['set' + setterCapitalized] = this._genSetPropertyFunction(setter, true);
      } else {
        this['set' + setterCapitalized] = this._genSetPropertyFunction(setter);
      }
    });
  }

  /**
   * _genMouseOverHandler - creates and returns an event handler function for
   * the mouseover event, this is added if fadeHover is true
   *
   * @return {Function}  The generated function
   */
  _genMouseOverHandler () {
    return (e) => {
      const miniElement = this.miniElement;
      const region = this.region;
      const opacity = this.settings.hoverOpacity;

      // filter is for IE 8 combatibility
      miniElement.style.opacity = `${opacity}`;
      miniElement.style.filter = `alpha(opacity=${opacity * 100})`;
      region.style.opacity = `${opacity}`;
      region.style.filter = `alpha(opacity=${opacity * 100})`;
    };
  }

  /**
   * _genMouseOutHandler - creates and returns an event handler function for
   * the mouseout event, this is added if fadeHover is true
   *
   * @return {Function}  The generated function
   */
  _genMouseOutHandler () {
    return (e) => {
      const miniElement = this.miniElement;
      const region = this.region;

      miniElement.style.opacity = null;
      miniElement.style.filter = null;
      region.style.opacity = null;
      region.style.filter = null;
    };
  }

  /**
   * _genOnResizeHandler - Generates a resize handler function
   *
   * @return {Function}  The generated function
   */
  _genOnResizeHandler () {
    return (e) => {
      // if the element isn't shown don't worry about resizing
      if (!this.shown) {
        return;
      }

      // calculate the appropriate heights for the miniElement and region
      // for the new page size
      const settings = this.settings;
      const scale = this._scale();
      const scaleCssString = `scale(${scale.x},${scale.y})`;

      const offsetTop = height(window) * settings.offsetHeightRatio;
      const offsetLeftRight = width(window) * settings.offsetWidthRatio;

      const top = height(this.baseElement) * (scale.y - 1) / 2 + offsetTop;
      const leftRight = width(this.baseElement) * (scale.x - 1) / 2 + offsetLeftRight;

      const thisWidth = width(window) * (1 / scale.x) * settings.widthRatio;
      const thisHeight = height(window) * (1 / scale.y) * settings.heightRatio;

      const miniElementCss = {
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

      cssObjAssign(this.miniElement, miniElementCss);

      const regionTop = this.baseElement.offsetTop * scale.y;
      const regionElementCss = {
        width: width(this.miniElement) + 'px',
        height: height(window) * scale.y + 'px',
        margin: '0px',
        top: window.scrollY * scale.y + offsetTop - regionTop + 'px'
      };
      regionElementCss[this.settings.position] = offsetLeftRight + 'px';

      cssObjAssign(this.region, regionElementCss);

      // the preview has changed, notify cb function
      this.settings.onPreviewChange(this.miniElement, scale);
    };
  }

  /**
   * _genOnScrollHandler - Generates an on scroll listener
   *
   * @return {Function}  The generated function
   */
  _genOnScrollHandler () {
    return (e) => {
      // don't change anything if element is hidden
      if (!this.shown) {
        return;
      }
      // calculate the position of the viewport relative to the page scroll
      // and change the region's position to reflect this
      const scale = this._scale();
      const offsetTop = height(window) * this.settings.offsetHeightRatio;
      const top = this.baseElement.offsetTop * scale.y;
      const pos = window.scrollY * scale.y;
      const regionHeight = outerHeight(this.region);
      const bottom = outerHeight(this.baseElement) * scale.y + top;

      if (pos + regionHeight + offsetTop < top || pos > bottom) {
        cssObjAssign(this.region, {display: 'none'});
      } else {
        cssObjAssign(this.region, {top: offsetTop + pos + 'px', display: 'block'});
      }
    };
  }

  /**
   * _genOnMouseUpHandler - Generates a handler function for the mouse up event
   *
   * @return {Function}  The generated function
   */
  _genOnMouseUpHandler () {
    return (e) => {
      // once the mouse is up we are no longer dragging
      this.mousedown = false;
      removeClass(this.baseElement, 'noselect');
      removeClass(this.region, 'dragging');
    };
  }

  /**
   * _genOnMouseMoveHandler - Generates a handler function for
   * the mouse move event
   *
   * @return {Function}  The generated function
   */
  _genOnMouseMoveHandler () {
    return (e) => {
      // if the mouse isn't down or we are smooth scrolling, ignore
      if (!this.mousedown || this.onSmoothScroll) {
        return;
      }
      this.scrollTop(e);
    };
  }

  /**
   * _genOnMouseDownHandler - Generates a handler function for
   * the mouse down event
   *
   * @return {Function}  The generated function
   */
  _genOnMouseDownHandler () {
    return (e) => {
      // the mouse is down and we are dragging
      this.mousedown = true;
      addClass(this.baseElement, 'noselect');
      addClass(this.region, 'dragging');
    };
  }

  /**
   * _genOnClickHandler - Generates a handler function for the click event
   *
   * @return {Function}  The generated function
   */
  _genOnClickHandler () {
    return (e) => {
      this.scrollTop(e);
      // if we clicked, we are no longer dragging.
      this.mousedown = false;
    };
  }

  /**
   * _genTouchHandler - Generates a handler function for touch events
   *
   * @return {Function }  The generated function
   */
  _genTouchHandler () {
    return (e) => {
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
      if (e.type === events[2] && this.lastTouchType === events[0]) {
        type = 'click';
      }

      var simulatedEvent = document.createEvent('MouseEvent');
      simulatedEvent.initMouseEvent(type, true, true, window, 1,
            touch.screenX, touch.screenY,
            touch.clientX, touch.clientY, false,
            false, false, false, 0, null);
      touch.target.dispatchEvent(simulatedEvent);
      e.preventDefault();
      this.lastTouchType = e.type;
    };
  }

  /**
   * scrollTop - Scrolls the viewport to the postion of the mouse event
   * on the minimap
   *
   * @param  {Event} e The mouse event
   */
  scrollTop (e) {
    if (!this.shown) {
      return;
    }

    const scale = this._scale();
    const offsetTop = height(window) * this.settings.offsetHeightRatio;
    const top = this.baseElement.offsetTop * scale.y;
    const regionHeight = outerHeight(this.region);

    let target = (e.clientY - regionHeight / 2 - offsetTop + top) / scale.y;

    // if we have smooth scroll enabled begin smooth scroll,
    // other wise just scroll to the destination
    if (e.type === 'click' && this.settings.smoothScroll) {
      const current = window.scrollY;
      const maxTarget = outerHeight(this.baseElement); // minimap.outerHeight(true); // mark!
      target = Math.max(target, Math.min(target, maxTarget));
      const direction = target > current;
      const delay = this.settings.smoothScrollDelay;
      const distance = Math.abs(current - target);
      const r = delay / distance;
      let unitScroll = 1;
      let unitDelay = 4;

      this.onSmoothScroll = false;
      if (r >= 4) {
        unitDelay = parseInt(unitScroll);
      } else if (r >= 1) {
        unitScroll = parseInt(r) * 4;
      } else {
        unitScroll = (4 / r);
      }

      let next = current;
      let count = parseInt(distance / unitScroll);
      this.onSmoothScroll = true;

      // linear translate
      const smoothScroll = function () {
        next = next + (direction ? unitScroll : -unitScroll);
        if (--count <= 0) {
          clearInterval(timer);
          this.onSmoothScroll = false;
          next = target;
        }
        const curScrollX = window.scrollX;
        window.scrollTo(curScrollX, next);
      };

      var timer = window.setInterval(smoothScroll, unitDelay);
    } else {
      var curScrollX = window.scrollX;
      window.scrollTo(curScrollX, target);
    }
    e.stopPropagation();
  }

  /**
   * _disableFind - Goes through each element in elements and adds dummy text
   * to disable ctrl-f on them
   *
   * @param  {Array} elements The collection of elements
   */
  _disableFind (elements) {
    elements.forEach((element) => {
      let newHTML = '';
      let stop = false;
      const currentElement = element;
      const html = currentElement.innerHTML;
      for (let i = 0; i < html.length; i++) {
        newHTML += html[i];
        if (html[i] === '<') { stop = true; }
        if (html[i] === '>') { stop = false; }
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

  _validateProps (props) {
    const keys = Object.keys(props);
    for (let key of keys) {
      const validator = propValidators[key];
      if (validator) {
        validator(props[key]);
      } else {
        throw new Error('Invalid validation property: ' + props[key]);
      }
    }
  }

  /**
   * _scale - Generates the x and y scale ratio to be used
   *
   * @return {Object}  Object containing the x and y scale values
   */
  _scale () {
    return {
      x: (width(window) / width(this.baseElement)) * this.settings.widthRatio,
      y: (height(window) / height(this.baseElement)) * this.settings.heightRatio
    };
  }

  /**
   * setPosition - changes the positon of the minimap, E.G. left or right
   *
   * @param  {String} position the position to change to
   */
  setPosition (position) {
    const oldValue = this.settings.position;
    const validator = propValidators['position'];
    validator(position);
    this.settings.position = position;
    if (oldValue !== this.settings.position) {
      const css = {};
      css[oldValue] = '';
      this.onResizeHandler();
      cssObjAssign(this.region, css);
      cssObjAssign(this.miniElement, css);
    }
  }

  /**
   * _genSetPropertyFunction - Generates a set property function
   *
   * @param  {String}  prop   The prop to be set
   * @param  {Boolean} redraw Whether redraw is necessary
   * @return {Function}       The setter function
   */
  _genSetPropertyFunction (prop, redraw) {
    return (value) => {
      const validator = propValidators[prop];
      validator(value);
      this.settings[prop] = value;
      if (redraw) {
        this.onResizeHandler();
      }
    };
  }

  /**
   * show - shows the minimap if it is hidden
   *
   */
  show () {
    if (!this.shown) {
      showElement(this.miniElement);
      showElement(this.region);
      this.shown = true;
      this.onResizeHandler();
    }
  }

  /**
   * hide - hides the minimap if it is shown
   *
   */
  hide () {
    if (this.shown) {
      hideElement(this.miniElement);
      hideElement(this.region);
      this.shown = false;
    }
  }

  /**
   * toggle - Toggles the minimap. Hides if it is show, shows if it is hidden.
   *
   */
  toggle () {
    toggleElement(this.miniElement);
    toggleElement(this.region);
    this.shown = !this.shown;
    if (this.shown) {
      this.onResizeHandler();
    }
  }
}

module.exports = MiniMap;

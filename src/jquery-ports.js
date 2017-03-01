/**
 * @file ports of some certain jquery functions
 * @author Austin Rausch
 */
module.exports = {
  width,
  height,
  isNumeric,
  isFunction,
  selectAll,
  select,
  remove,
  hasClass,
  addClass,
  removeClass,
  cssObjAssign,
  cloneNode,
  outerHeight,
  showElement,
  hideElement,
  toggleElement
};

/**
 * width - returns the calculated width of an HTML element or
 * the width of the viewport.
 *
 * @param  {Element} element the element or window to get the width of.
 * @return {Number}          the width of the element or window
 */
function width (element) {
  if (element === window) {
    return element.document.documentElement.clientWidth;
  }
  return element.getBoundingClientRect().width;
}

/**
 * height - returns the calculated height of an HTML element or
 * the height of the viewport
 *
 * @param  {Element} element the element or window to get the height of
 * @return {Number}          the height of the element or window
 */
function height (element) {
  if (element === window) {
    return element.document.documentElement.clientHeight;
  }
  return element.getBoundingClientRect().height;
}

/**
 * isNumeric - returns whether or not the input is a finite number
 *
 * @param  {*} n The input to test
 * @return {Boolean}   true if it is a finite number, false otherwise
 */
function isNumeric (n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * isFunction - returns wheter or not the input is a function
 *
 * @param  {*} fn the input to test
 * @return {Boolean}    returns true if it is a function, false otherwise
 */
function isFunction (fn) {
  return (typeof fn === 'function');
}

/**
 * selectAll - returns elements that match the selector that are children of
 * the element param, or it returns elements that are part of the document that
 * match the selector in the event that element is omitted
 *
 * @param  {String} selector   The selector to search with
 * @param  {Element} [element] The element to search from
 * @return {NodeList}          collection of matching elements
 */
function selectAll (selector, element) {
  if (element) {
    return element.querySelectorAll(selector);
  }
  return document.querySelectorAll(selector);
}

/**
 * select - returns the first element that matches the selector from either
 * the element supplied or the document if element is omitted.
 *
 * @param  {String} selector The selector to search with
 * @param  {Element} [element]  The element to search from
 * @return {Element}            The first matched element
 */
function select (selector, element) {
  if (element) {
    return element.querySelector(selector);
  }
  return document.querySelector(selector);
}

/**
 * remove - removes an element or a collection of elements from the DOM
 *
 * @param {Element|NodeList|Array} element the element or collection to remove
 */
function remove (element) {
  if (element) {
    if ((typeof element) === (typeof []) || element.constructor.name === 'NodeList') {
      element.forEach(function (cur) {
        cur.parentNode.removeChild(cur);
      });
      return;
    }
    element.parentNode.removeChild(element);
  }
}

/**
 * hasClass - tests if the inputted element has the supplied class name attached
 * to it
 *
 * @param  {Element} el        The inputted element
 * @param  {String} className The class name to test for
 * @return {Boolean}           True if it has the class name, false otherwise
 */
function hasClass (el, className) {
  if (!el.className && el.className !== '') {
    el = el.documentElement;
  }
  return !!el.className.match(new RegExp('(\\s|^)' + className + '(\\s|$)'));
}

/**
 * addClass - adds a class to the element if it does not have it
 *
 * @param {Element} el        the element to add to
 * @param {String}  className the class name to add
 */
function addClass (el, className) {
  if (!hasClass(el, className)) {
    el.className += ' ' + className;
  }
}

/**
 * removeClass - removes a class from an element if it is has the class
 *
 * @param {Element} el        the element to remove from
 * @param {String}  className the class name to remove
 */
function removeClass (el, className) {
  if (hasClass(el, className)) {
    var reg = new RegExp('(\\s|^)' + className + '(\\s|$)');
    el.className = el.className.replace(reg, ' ');
  }
}

/**
 * cssObjAssign - assigns the key value pairs to the style of the object
 *
 * @param {Element} element    The element to assign to
 * @param {Object}  properties The object of key value pairs to assign from
 */
function cssObjAssign (element, properties) {
  var keys = Object.keys(properties);
  var elStyle = element.style;
  keys.forEach(function (key) {
    elStyle[key] = properties[key];
  });
}

/**
 * cloneNode - returns a deep copy (including children) of the inputted element
 *
 * @param  {Element} element the element to clone
 * @return {Element}         the clone of the element
 */
function cloneNode (element) {
  return element.cloneNode(true);
}

/**
 * outerHeight - calculates the outer height of the inputted element
 * This includes margin, border, padding and the client height of the element
 *
 * @param  {Element} elem the element to calculate the outer height of
 * @return {Number}       the resulting outer height
 */
function outerHeight (elem) {
  function _removePx (string) {
    return string.substring(0, string.length - 2);
  }
  var style = window.getComputedStyle(elem);

  var marginTop = parseInt(_removePx(style.marginTop));
  var marginBottom = parseInt(_removePx(style.marginBottom));
  var margin = marginTop + marginBottom;

  var border = parseInt(_removePx(style.borderWidth));

  var paddingTop = parseInt(_removePx(style.paddingTop));
  var paddingBottom = parseInt(_removePx(style.paddingBottom));
  var padding = paddingTop + paddingBottom;

  var clientHeight = elem.clientHeight;

  return margin + padding + border + clientHeight;
}

/**
 * showElement - resets the display style of the element to its default
 *
 * @param {Element} elem element to show
 */
function showElement (elem) {
  elem.style.display = null;
}

/**
 * hideElement - changes the display style of the element to none
 *
 * @param {Element} elem element to hide
 */
function hideElement (elem) {
  elem.style.display = 'none';
}

/**
 * toggleElement - hides an element if it is shown, shows if it is hidden
 *
 * @param {Element} elem the element to toggle
 */
function toggleElement (elem) {
  if (elem.style.display === 'none') {
    showElement(elem);
  } else {
    hideElement(elem);
  }
}

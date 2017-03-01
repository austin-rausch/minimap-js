minimap
================
NOTE: This module is a port of a jQuery plugin using just Javascript. Minified and including the CSS file this module is 11kb.

The original author is [Prince John Wesley](http://www.toolitup.com).

The original plugin's repository can be found [here](https://github.com/princejwesley/minimap).

**Description**: A preview of full webpage or its DOM element with flexible positioning and navigation support.

## Getting Started

### Download the latest code


[Fork](https://github.com/austin-rausch/minimap) this repository or download js/css files from  `dist` directory.

### Including it on your page

Include jQuery and this module on a page.

```html
<!-- Alternatively can include non-minified files -->
<link rel="stylesheet" href="minimap.min.css" />
<script src="minimap.min.js"></script>
```
#### OR
With a module bundler such as [Lasso.js](https://github.com/lasso-js/lasso).

```Javascript
var MiniMap = require('minimap-js');
```
### Basic Usage
```javascript
// 'element' is desired dom element
var minimap = new MiniMap(element, options);
minimap.show();
```
### Options
#### heightRatio
> `height` ratio of the view port. ratio can be in the range [0.0, 1.0). (*default: **0.6***)

#### widthRatio
> `width` ratio of the view port. ratio can be in the range [0.0, 0.5). (*default: **0.05***)

#### offsetHeightRatio
> Margin `top` ratio of the view port. ratio can be in the range (0.0, 0.9]. (*default: **0.035***)

#### offsetWidthRatio
> Margin `left` or `right`(*based on `position` property*) ratio of the view port. ratio can be in the range (0.0, 0.9]. (*default: **0.035***)

#### allowClick
> whether or not to allow clicking to scroll through the page on the minimap & region element. (*default: **true***)

#### fadeHover
> Whether or not to fade the element to hoverOpacity and a transition speed of hoverFadeSpeed seconds when mouse over. (*default: **false***)

#### hoverOpacity
> Opacity value [0.0, 1.0] to set the opacity of the element to if fadeHover is true. (*default: **0.4***)

#### hoverFadeSpeed
> Transition speed [0.0, infinity) for the opacity if fadeHover is true. (*default: **0.5***)

#### position
> `position` of the minimap. Supported positions are:

1. `'right'` (*default*)
2. `'left'`

### touch
> `touch` support. (default: *true*)

### smoothScroll
>linear `animation` support for scrolling. (dafault: *true*)

### smoothScrollDelay
> Smooth scroll delay in milliseconds. (default: 200ms)

### disableFind
> `disableFind` if true, prevents browser CTRL+F from finding duplicated text in minimap. (default: *false*)

## Setters
### function setPosition(position)
> Set `position` property. `position` can be either `'left'` or `'right'`

### function setHeightRatio(ratio)
> Set `heightRatio` property.

### function setWidthRatio(ratio)
> Set `widthRatio` property.

### function setOffsetHeightRatio(ratio)
> Set `offsetHeightRatio` property.

### function setOffsetWidthRatio(ratio)
> Set `offsetWidthRatio` property.

### function setSmoothScroll(smooth)
> Set `smoothScroll` property

### function setSmoothScrollDelay(duration)
> Set `setSmoothScrollDelay` property.

## Callback
### function onPreviewChange(minimap, scale)
> `onPreviewChange` callback will be triggered for the below cases:

1. View port is resized.
2. Calling setter functions.

Use this function to *customize* DOMs inside minimap.

Parameters:
```
minimap - $minimap DOM
scale - Scale object with `x` and `y` properties.(width/height ratio of minimap with respect to viewport)
```
## Other functions
### function show()
> Show preview

### function hide()
> Hide preview

### function toggle()
> Toggle Preview

### Default Settings
Mini-map with default values
```javascript
var previewBody = new MiniMap(
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
    onPreviewChange: function (minimap, scale) {},
    disableFind: false
});
```

#### CSS classes
Use the below css classes for customization
> `.minimap` - Mini-map area

> `.miniregion` - Mini-map view area

## Caveats
1. Async updates to the dom elements after minimap was created may not reflect in the preview.

## License
This plugin is licensed under the [MIT license](https://github.com/princejwesley/minimap/blob/master/LICENSE).

Copyright (c) 2014 [Prince John Wesley](http://www.toolitup.com)

/*
GOAL: This module should mirror the NodeJS module system according the documented behavior.
The module transport will generate code that is used for resolving
real paths for a given logical path. This information is used to
resolve dependencies on client-side (in the browser).

Inspired by:
https://github.com/joyent/node/blob/master/lib/module.js
*/
(function() {
    var win = typeof window === 'undefined' ? null : window;

    if (win && win.$rmod) {
        return;
    }

    /** the module runtime */
    var $rmod;

    // this object stores the module factories with the keys being real paths of module (e.g. "/baz@3.0.0/lib/index" --> Function)
    var definitions = {};

    // Search path that will be checked when looking for modules
    var searchPaths = [];

    // The _ready flag is used to determine if "run" modules can
    // be executed or if they should be deferred until all dependencies
    // have been loaded
    var _ready = false;

    // If $rmod.run() is called when the page is not ready then
    // we queue up the run modules to be executed later
    var runQueue = [];

    // this object stores the Module instance cache with the keys being logical paths of modules (e.g., "/$/foo/$/baz" --> Module)
    var instanceCache = {};

    // this object maps dependency logical path to a specific version (for example, "/$/foo/$/baz" --> ["3.0.0"])
    // Each entry in the object is an array. The first item of the array is the version number of the dependency.
    // The second item of the array (if present), is the real dependency ID if the entry belongs to a remapping rule.
    // For example, with a remapping, an entry might look like:
    //      "/$/streams" => ["3.0.0", "streams-browser"]
    // An example with no remapping:
    //      "/$/streams" => ["3.0.0"]
    var dependencies = {};

    // this object maps relative paths to a specific real path
    var mains = {};

    // used to remap a real path to a new path (keys are real paths and values are relative paths)
    var remapped = {};

    var cacheByDirname = {};

    // When a module is mapped to a global varialble we add a reference
    // that maps the real path of the module to the loaded global instance.
    // We use this mapping to ensure that global modules are only loaded
    // once if they map to the same real path.
    //
    // See issue #5 - Ensure modules mapped to globals only load once
    // https://github.com/raptorjs/raptor-modules/issues/5
    var loadedGlobalsByRealPath = {};

    // temporary variable for referencing a prototype
    var proto;

    function moduleNotFoundError(target, from) {
        var err = new Error('Cannot find module "' + target + '"' + (from ? ' from "' + from + '"' : ''));

        err.code = 'MODULE_NOT_FOUND';
        return err;
    }

    function Module(resolved) {
       /*
        A Node module has these properties:
        - filename: The logical path of the module
        - id: The logical path of the module (same as filename)
        - exports: The exports provided during load
        - loaded: Has module been fully loaded (set to false until factory function returns)

        NOT SUPPORTED BY RAPTOR:
        - parent: parent Module
        - paths: The search path used by this module (NOTE: not documented in Node.js module system so we don't need support)
        - children: The modules that were required by this module
        */
        this.id = this.filename = resolved[0];
        this.loaded = false;
    }

    Module.cache = instanceCache;

    proto = Module.prototype;

    proto.load = function(factoryOrObject) {
        var logicalPath = this.id;

        if (factoryOrObject && factoryOrObject.constructor === Function) {
            // factoryOrObject is definitely a function
            var lastSlashPos = logicalPath.lastIndexOf('/');

            // find the value for the __dirname parameter to factory
            var dirname = logicalPath.substring(0, lastSlashPos);

            // find the value for the __filename paramter to factory
            var filename = logicalPath;

            // local cache for requires initiated from this module/dirname
            var localCache = cacheByDirname[dirname] || (cacheByDirname[dirname] = {});

            // this is the require used by the module
            var instanceRequire = function(target) {
                return localCache[target] || (localCache[target] = require(target, dirname));
            };

            // The require method should have a resolve method that will return logical
            // path but not actually instantiate the module.
            // This resolve function will make sure a definition exists for the corresponding
            // real path of the target but it will not instantiate a new instance of the target.
            instanceRequire.resolve = function(target) {
                if (!target) {
                    throw moduleNotFoundError('');
                }

                var resolved = resolve(target, dirname);

                if (!resolved) {
                    throw moduleNotFoundError(target, dirname);
                }

                // Return logical path
                // NOTE: resolved[0] is logical path
                return resolved[0];
            };

            // NodeJS provides access to the cache as a property of the "require" function
            instanceRequire.cache = instanceCache;

            // Expose the module system runtime via the `runtime` property
            instanceRequire.runtime = $rmod;

            // $rmod.def("/foo@1.0.0/lib/index", function(require, exports, module, __filename, __dirname) {
            this.exports = {};

            // call the factory function
            factoryOrObject.call(this, instanceRequire, this.exports, this, filename, dirname);
        } else {
            // factoryOrObject is not a function so have exports reference factoryOrObject
            this.exports = factoryOrObject;
        }

        this.loaded = true;
    };

    /**
     * Defines a packages whose metadata is used by raptor-loader to load the package.
     */
    function define(realPath, factoryOrObject, options) {
        /*
        $rmod.def('/baz@3.0.0/lib/index', function(require, exports, module, __filename, __dirname) {
            // module source code goes here
        });
        */

        var globals = options && options.globals;

        definitions[realPath] = factoryOrObject;

        if (globals) {
            var target = win || global;
            for (var i=0;i<globals.length; i++) {
                var globalVarName = globals[i];
                loadedGlobalsByRealPath[realPath] = target[globalVarName] = require(realPath, realPath);
            }
        }
    }

    function registerMain(realPath, relativePath) {
        mains[realPath] = relativePath;
    }

    function remap(oldRealPath, relativePath) {
        remapped[oldRealPath] = relativePath;
    }

    function registerDependency(logicalParentPath, dependencyId, dependencyVersion, dependencyAlsoKnownAs) {
        if (dependencyId === false) {
            // This module has been remapped to a "void" module (empty object) for the browser.
            // Add an entry in the dependencies, but use `null` as the value (handled differently from undefined)
            dependencies[logicalParentPath + '/$/' + dependencyAlsoKnownAs] = null;
            return;
        }

        var logicalPath = dependencyId.charAt(0) === '.' ?
            logicalParentPath + dependencyId.substring(1) : // Remove '.' at the beginning
            logicalParentPath + '/$/' + dependencyId;

        dependencies[logicalPath] =  [dependencyVersion];
        if (dependencyAlsoKnownAs !== undefined) {
            dependencies[logicalParentPath + '/$/' + dependencyAlsoKnownAs] =  [dependencyVersion, dependencyId, logicalPath];
        }
    }

    /**
     * This function will take an array of path parts and normalize them by handling handle ".." and "."
     * and then joining the resultant string.
     *
     * @param {Array} parts an array of parts that presumedly was split on the "/" character.
     */
    function normalizePathParts(parts) {

        // IMPORTANT: It is assumed that parts[0] === "" because this method is used to
        // join an absolute path to a relative path
        var i;
        var len = 0;

        var numParts = parts.length;

        for (i = 0; i < numParts; i++) {
            var part = parts[i];

            if (part === '.') {
                // ignore parts with just "."
                /*
                // if the "." is at end of parts (e.g. ["a", "b", "."]) then trim it off
                if (i === numParts - 1) {
                    //len--;
                }
                */
            } else if (part === '..') {
                // overwrite the previous item by decrementing length
                len--;
            } else {
                // add this part to result and increment length
                parts[len] = part;
                len++;
            }
        }

        if (len === 1) {
            // if we end up with just one part that is empty string
            // (which can happen if input is ["", "."]) then return
            // string with just the leading slash
            return '/';
        } else if (len > 2) {
            // parts i s
            // ["", "a", ""]
            // ["", "a", "b", ""]
            if (parts[len - 1].length === 0) {
                // last part is an empty string which would result in trailing slash
                len--;
            }
        }

        // truncate parts to remove unused
        parts.length = len;
        return parts.join('/');
    }

    function join(from, target) {
        var targetParts = target.split('/');
        var fromParts = from == '/' ? [''] : from.split('/');
        return normalizePathParts(fromParts.concat(targetParts));
    }

    function withoutExtension(path) {
        var lastDotPos = path.lastIndexOf('.');
        var lastSlashPos;

        /* jshint laxbreak:true */
        return ((lastDotPos === -1) || ((lastSlashPos = path.lastIndexOf('/')) !== -1) && (lastSlashPos > lastDotPos))
            ? null // use null to indicate that returned path is same as given path
            : path.substring(0, lastDotPos);
    }

    function truncate(str, length) {
        return str.substring(0, str.length - length);
    }

    /**
     * @param {String} logicalParentPath the path from which given dependencyId is required
     * @param {String} dependencyId the name of the module (e.g. "async") (NOTE: should not contain slashes)
     * @param {String} full version of the dependency that is required from given logical parent path
     */
    function versionedDependencyInfo(logicalPath, dependencyId, subpath, dependencyVersion) {
        // Our internal module resolver will return an array with the following properties:
        // - logicalPath: The logical path of the module (used for caching instances)
        // - realPath: The real path of the module (used for instantiating new instances via factory)
        var realPath = dependencyVersion && ('/' + dependencyId + '@' + dependencyVersion + subpath);
        logicalPath = logicalPath + subpath;

        // return [logicalPath, realPath, factoryOrObject]
        return [logicalPath, realPath, undefined];
    }

    function resolveAbsolute(target, origTarget) {
        var start = target.lastIndexOf('$');
        if (start === -1) {
            // return [logicalPath, realPath, factoryOrObject]
            return [target, target, undefined];
        }

        // target is something like "/$/foo/$/baz/lib/index"
        // In this example we need to find what version of "baz" foo requires

        // "start" is currently pointing to the last "$". We want to find the dependencyId
        // which will start after after the substring "$/" (so we increment by two)
        start += 2;

        // the "end" needs to point to the slash that follows the "$" (if there is one)
        var end = target.indexOf('/', start + 3);
        var logicalPath;
        var subpath;
        var dependencyId;

        if (end === -1) {
            // target is something like "/$/foo/$/baz" so there is no subpath after the dependencyId
            logicalPath = target;
            subpath = '';
            dependencyId = target.substring(start);
        } else {
            // Fixes https://github.com/raptorjs/raptor-modules/issues/15
            // Handle scoped packages where scope and package name are separated by a
            // forward slash (e.g. '@scope/package-name')
            //
            // In the case of scoped packages the dependencyId should be the combination of the scope
            // and the package name. Therefore if the target module begins with an '@' symbol then
            // skip past the first slash
            if (target.charAt(start) === '@') {
                end = target.indexOf('/', end+1);
            }

            // target is something like "/$/foo/$/baz/lib/index" so we need to separate subpath
            // from the dependencyId

            // logical path should not include the subpath
            logicalPath = target.substring(0, end);

            // subpath will be something like "/lib/index"
            subpath = target.substring(end);

            // dependencyId will be something like "baz" (will not contain slashes)
            dependencyId = target.substring(start, end);
        }

        // lookup the version
        var dependencyInfo = dependencies[logicalPath];
        if (dependencyInfo === undefined) {
            return undefined;
        }

        if (dependencyInfo === null) {
            // This dependency has been mapped to a void module (empty object). Return an empty
            // array as an indicator
            return [];
        }

        return versionedDependencyInfo(
            // dependencyInfo[2] is the logicalPath that the module should actually use
            // if it has been remapped. If dependencyInfo[2] is undefined then we haven't
            // found a remapped module and simply use the logicalPath that we checked
            dependencyInfo[2] || logicalPath,

            // realPath:
            // dependencyInfo[1] is the optional remapped dependency ID
            // (use the actual dependencyID from target if remapped dependency ID is undefined)
            dependencyInfo[1] || dependencyId,

            subpath,

            // first item is version number
            dependencyInfo[0]);
    }

    function resolveModule(target, from) {
        if (target.charAt(target.length-1) === '/') {
            // This is a hack because I found require('util/') in the wild and
            // it did not work because of the trailing slash
            target = target.slice(0, -1);
        }

        var len = searchPaths.length;
        for (var i = 0; i < len; i++) {
            // search path entries always end in "/";
            var candidate = searchPaths[i] + target;
            var resolved = resolve(candidate, from);
            if (resolved) {
                return resolved;
            }
        }

        var dependencyId;
        var subpath;

        var lastSlashPos = target.indexOf('/');

        // Fixes https://github.com/raptorjs/raptor-modules/issues/15
        // Handle scoped packages where scope and package name are separated by a
        // forward slash (e.g. '@scope/package-name')
        //
        // In the case of scoped packages the dependencyId should be the combination of the scope
        // and the package name. Therefore if the target module begins with an '@' symbol then
        // skip past the first slash
        if (lastSlashPos !== -1 && target.charAt(0) === '@') {
            lastSlashPos = target.indexOf('/', lastSlashPos+1);
        }

        if (lastSlashPos === -1) {
            dependencyId = target;
            subpath = '';
        } else {
            // When we're resolving a module, we don't care about the subpath at first
            dependencyId = target.substring(0, lastSlashPos);
            subpath = target.substring(lastSlashPos);
        }

        /*
        Consider when the module "baz" (which is a dependency of "foo") requires module "async":
        resolve('async', '/$/foo/$/baz');

        // TRY
        /$/foo/$/baz/$/async
        /$/foo/$/async
        /$/async

        // SKIP
        /$/foo/$/$/async
        /$/$/async
        */

        // First check to see if there is a sibling "$" with the given target
        // by adding "/$/<target>" to the given "from" path.
        // If the given from is "/$/foo/$/baz" then we will try "/$/foo/$/baz/$/async"
        var logicalPath = from + '/$/' + dependencyId;
        var dependencyInfo = dependencies[logicalPath];
        if (dependencyInfo !== undefined) {
            if (dependencyInfo === null) {
                // This dependency has been mapped to a void module (empty object). Return an empty
                // array as an indicator
                return [];
            }
            return versionedDependencyInfo(
                // dependencyInfo[2] is the logicalPath that the module should actually use
                // if it has been remapped. If dependencyInfo[2] is undefined then we haven't
                // found a remapped module and simply use the logicalPath that we checked
                dependencyInfo[2] || logicalPath,

                // dependencyInfo[1] is the optional remapped dependency ID
                // (use the actual dependencyID from target if remapped dependency ID is undefined)
                dependencyInfo[1] || dependencyId,

                subpath,

                // dependencyVersion
                dependencyInfo[0]);
        }

        var end = from.lastIndexOf('/');

        // if there is no "/" in the from path then this path is technically invalid (right?)
        while(end !== -1) {

            var start = -1;

            // make sure we don't check a logical path that would end with "/$/$/dependencyId"
            if (end > 0) {
                start = from.lastIndexOf('/', end - 1);
                if ((start !== -1) && (end - start === 2) && (from.charAt(start + 1) === '$')) {
                    // check to see if the substring from [start:end] is '/$/'
                    // skip look at this subpath because it ends with "/$/"
                    end = start;
                    continue;
                }
            }

            logicalPath = from.substring(0, end) + '/$/' + dependencyId;

            dependencyInfo = dependencies[logicalPath];
            if (dependencyInfo !== undefined) {
                if (dependencyInfo === null) {
                    return [];
                }

                return versionedDependencyInfo(
                    // dependencyInfo[2] is the logicalPath that the module should actually use
                    // if it has been remapped. If dependencyInfo[2] is undefined then we haven't
                    // found a remapped module and simply use the logicalPath that we checked
                    dependencyInfo[2] || logicalPath,

                    // dependencyInfo[1] is the optional remapped dependency ID
                    // (use the actual dependencyID from target if remapped dependency ID is undefined)
                    dependencyInfo[1] || dependencyId,

                    subpath,

                    // version number
                    dependencyInfo[0]);
            } else if (start === -1) {
                break;
            }

            // move end to the last slash that precedes it
            end = start;
        }

        // not found
        return undefined;
    }

    function resolve(target, from) {
        var resolved;
        var remappedPath;

        if (target.charAt(0) === '.') {
            // turn relative path into absolute path
            resolved = resolveAbsolute(join(from, target), target);
        } else if (target.charAt(0) === '/') {
            // handle targets such as "/my/file" or "/$/foo/$/baz"
            resolved = resolveAbsolute(normalizePathParts(target.split('/')));
        } else {
            remappedPath = remapped[target];
            if (remappedPath) {
                // The remapped path should be a complete logical path
                return resolve(remappedPath);
            } else {
                // handle targets such as "foo/lib/index"
                resolved = resolveModule(target, from);
            }
        }

        if (!resolved) {
            return undefined;
        }

        var logicalPath = resolved[0];
        var realPath = resolved[1];

        if (logicalPath === undefined) {
            // This dependency has been mapped to a void module (empty object).
            // Use a special '$' for logicalPath and realPath and an empty object for the factoryOrObject
            return ['$', '$', {}];
        }

        if (!realPath) {
            return resolve(logicalPath);
        }

        // target is something like "/foo/baz"
        // There is no installed module in the path
        var relativePath;

        // check to see if "target" is a "directory" which has a registered main file
        if ((relativePath = mains[realPath]) !== undefined) {
            // there is a main file corresponding to the given target so add the relative path
            logicalPath = join(logicalPath, relativePath);
            realPath = join(realPath, relativePath);
        }

        remappedPath = remapped[realPath];
        if (remappedPath !== undefined) {
            // remappedPath should be treated as a relative path
            logicalPath = join(logicalPath + '/..', remappedPath);
            realPath = join(realPath + '/..', remappedPath);
        }

        var factoryOrObject = definitions[realPath];
        if (factoryOrObject === undefined) {
            // check for definition for given realPath but without extension
            var realPathWithoutExtension;
            if (((realPathWithoutExtension = withoutExtension(realPath)) === null) ||
                ((factoryOrObject = definitions[realPathWithoutExtension]) === undefined)) {
                return undefined;
            }

            // we found the definition based on real path without extension so
            // update logical path and real path
            logicalPath = truncate(logicalPath, realPath.length - realPathWithoutExtension.length);
            realPath = realPathWithoutExtension;
        }

        // since we had to make sure a definition existed don't throw this away
        resolved[0] = logicalPath;
        resolved[1] = realPath;
        resolved[2] = factoryOrObject;

        return resolved;
    }

    function require(target, from) {
        if (!target) {
            throw moduleNotFoundError('');
        }

        var resolved = resolve(target, from);
        if (!resolved) {
            throw moduleNotFoundError(target, from);
        }

        var logicalPath = resolved[0];

        var module = instanceCache[logicalPath];

        if (module !== undefined) {
            // found cached entry based on the logical path
            return module.exports;
        }

        // Fixes issue #5 - Ensure modules mapped to globals only load once
        // https://github.com/raptorjs/raptor-modules/issues/5
        //
        // If a module is mapped to a global variable then we want to always
        // return that global instance of the module when it is being required
        // to avoid duplicate modules being loaded. For modules that are mapped
        // to global variables we also add an entry that maps the real path
        // of the module to the global instance of the loaded module.
        var realPath = resolved[1];
        if (loadedGlobalsByRealPath.hasOwnProperty(realPath)) {
            return loadedGlobalsByRealPath[realPath];
        }

        var factoryOrObject = resolved[2];

        module = new Module(resolved);

        // cache the instance before loading (allows support for circular dependency with partial loading)
        instanceCache[logicalPath] = module;

        module.load(factoryOrObject);

        return module.exports;
    }

    /*
    $rmod.run('/$/installed-module', '/src/foo');
    */
    function run(logicalPath, options) {
        var wait = !options || (options.wait !== false);
        if (wait && !_ready) {
            return runQueue.push([logicalPath, options]);
        }

        require(logicalPath, '/');
    }

    /*
     * Mark the page as being ready and execute any of the
     * run modules that were deferred
     */
    function ready() {
        _ready = true;

        var len;
        while((len = runQueue.length)) {
            // store a reference to the queue before we reset it
            var queue = runQueue;

            // clear out the queue
            runQueue = [];

            // run all of the current jobs
            for (var i = 0; i < len; i++) {
                var args = queue[i];
                run(args[0], args[1]);
            }

            // stop running jobs in the queue if we change to not ready
            if (!_ready) {
                break;
            }
        }
    }

    function addSearchPath(prefix) {
        searchPaths.push(prefix);
    }

    var pendingCount = 0;
    var onPendingComplete = function() {
        pendingCount--;
        if (!pendingCount) {
            // Trigger any "require-run" modules in the queue to run
            ready();
        }
    };

    /*
     * $rmod is the short-hand version that that the transport layer expects
     * to be in the browser window object
     */
    $rmod = {
        // "def" is used to define a module
        def: define,

        // "dep" is used to register a dependency (e.g. "/$/foo" depends on "baz")
        dep: registerDependency,
        run: run,
        main: registerMain,
        remap: remap,
        require: require,
        resolve: resolve,
        join: join,
        ready: ready,
        addSearchPath: addSearchPath,

        /**
         * Asynchronous bundle loaders should call `pending()` to instantiate
         * a new job. The object we return here has a `done` method that
         * should be called when the job completes. When the number of
         * pending jobs drops to 0, we invoke any of the require-run modules
         * that have been declared.
         */
        pending: function() {
            _ready = false;
            pendingCount++;
            return {
                done: onPendingComplete
            };
        }
    };

    if (win) {
        win.$rmod = $rmod;
    } else {
        module.exports = $rmod;
    }
})();

$rmod.def("/src/jquery-ports", function(require, exports, module, __filename, __dirname) { /**
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

});
$rmod.def("/src/minimap", function(require, exports, module, __filename, __dirname) { /*! The MIT License (MIT)

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

class minimap {
  constructor (baseElement, options) {
    this.baseElement = baseElement;
    this.shown = false;
    this.mousedown = false;
    this.onSmoothScroll = false;
    this.lastTouchType = '';

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

    this._validateProps(settings);

    const miniElement = this.miniElement = cloneNode(baseElement);

    remove(selectAll('.minimap .noselect', miniElement));
    remove(selectAll('.miniregion', miniElement));

    addClass(miniElement, 'minimap noselect');

    const miniChildren = miniElement.children;
    let current;

    if (settings.disableFind === true) {
      for (let i = 0; i < miniChildren.length; i++) {
        current = miniChildren[i];
        addClass(current, 'unsearchable');
      }
    }

    for (let i = 0; i < miniChildren.length; i++) {
      current = miniChildren[i];
      cssObjAssign(current, {'pointer-events': 'none'});
    }

    const region = this.region = document.createElement('div');
    addClass(region, 'miniregion');

    const body = document.body;
    body.appendChild(region);
    body.appendChild(miniElement);

    this._disableFind(selectAll('.unsearchable'));

    const onScrollHandler = this.onScrollHandler = this._genOnScrollHandler();
    const onResizeHandler = this.onResizeHandler = this._genOnResizeHandler();

    onResizeHandler();

    window.addEventListener('resize', onResizeHandler);
    window.addEventListener('scroll', onScrollHandler);

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

      miniElement.style.cursor = 'pointer';
      region.style.cursor = 'pointer';
    }

    if (settings.touch) {
      const touchHandler = this.touchHandler = this._genTouchHandler();
      document.addEventListener('touchstart', touchHandler, true);
      document.addEventListener('touchmove', touchHandler, true);
      document.addEventListener('touchend', touchHandler, true);
      document.addEventListener('touchcancel', touchHandler, true);
    }

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

  addSetters (setters) {
    setters.forEach((setter) => {
      // capitalize the first letter, E.G. heightRatio => HeightRatio
      const setterCapitalized = setter.substring(0, 1).toUpperCase() + setter.substring(1);
      if (redrawAttributes.has(setter)) {
        this['set' + setterCapitalized] = this._genSetPropertyFunction(setter, true);
      } else {
        this['set' + setterCapitalized] = this._genSetPropertyFunction(setter);
      }
    });
  }

  _genMouseOverHandler () {
    return (e) => {
      const miniElement = this.miniElement;
      const region = this.region;
      const opacity = this.settings.hoverOpacity;

      miniElement.style.opacity = `${opacity}`;
      miniElement.style.filter = `alpha(opacity=${opacity * 100})`;
      region.style.opacity = `${opacity}`;
      region.style.filter = `alpha(opacity=${opacity * 100})`;
    };
  }

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

  _genOnResizeHandler () {
    return (e) => {
      if (!this.shown) {
        return;
      }
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

      if (this.settings.allowClick) {
        regionElementCss['box-shadow'] = '0 0 0.4em darkgrey';
      }

      cssObjAssign(this.region, regionElementCss);

      this.settings.onPreviewChange(this.miniElement, scale);
    };
  }

  _genOnScrollHandler () {
    return (e) => {
      if (!this.shown) {
        return;
      }
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

  _genOnMouseUpHandler () {
    return (e) => {
      this.mousedown = false;
      removeClass(this.baseElement, 'noselect');
      removeClass(this.region, 'dragging');
    };
  }

  _genOnMouseMoveHandler () {
    return (e) => {
      if (!this.mousedown || this.onSmoothScroll) {
        return;
      }
      this.scrollTop(e);
    };
  }

  _genOnMouseDownHandler () {
    return (e) => {
      this.mousedown = true;
      addClass(this.baseElement, 'noselect');
      addClass(this.region, 'dragging');
    };
  }

  _genOnClickHandler () {
    return (e) => {
      this.scrollTop(e);
      this.mousedown = false;
    };
  }

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

  scrollTop (e) {
    if (!this.shown) {
      return;
    }

    const scale = this._scale();
    const offsetTop = height(window) * this.settings.offsetHeightRatio;
    const top = this.baseElement.offsetTop * scale.y;
    const regionHeight = outerHeight(this.region);

    let target = (e.clientY - regionHeight / 2 - offsetTop + top) / scale.y;

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

  _scale () {
    return {
      x: (width(window) / width(this.baseElement)) * this.settings.widthRatio,
      y: (height(window) / height(this.baseElement)) * this.settings.heightRatio
    };
  }

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

  show () {
    if (!this.shown) {
      showElement(this.miniElement);
      showElement(this.region);
      this.shown = true;
      this.onResizeHandler();
    }
  }

  hide () {
    if (this.shown) {
      hideElement(this.miniElement);
      hideElement(this.region);
      this.shown = false;
    }
  }

  toggle () {
    toggleElement(this.miniElement);
    toggleElement(this.region);
    this.shown = !this.shown;
    if (this.shown) {
      this.onResizeHandler();
    }
  }
}

module.exports = minimap;

});
$rmod.def("/test/main", function(require, exports, module, __filename, __dirname) { var MiniMap = require('../src/minimap');
var minimapElement = window.minimapElement = new MiniMap(document.body,
  {
    fadeHover: true,
    allowClick: false,
    hoverOpacity: 0
  });
minimapElement.show();

});
$rmod.run("/test/main");
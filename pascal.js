(function() {

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Create a safe reference to the Underscore object for use below.
  var Pascal = function(obj) {
    if (obj instanceof Pascal) return obj;
    if (!(this instanceof Pascal)) return new Pascal(obj);
  };

  // Export the object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Pascal;
    }
    exports.Pascal = Pascal;
  } else {
    root.Pascal = Pascal;
  }

  // Current version.
  Pascal.VERSION = '0.1.1';


  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('Pascal', [], function() {
      return Pascal;
    });
  }
}).call(this);
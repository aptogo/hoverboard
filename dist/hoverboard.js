!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),o.Hoverboard=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (root, factory) {
  /*global define:true */

    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else {
        // Browser globals
        root.ensureArray = factory();
    }
}(this, function () {
  'use strict';

  function ensureArray(a, b, n) {
    if (arguments.length === 0) return [];            //no args, ret []
    if (arguments.length === 1) {                     //single argument
      if (a === undefined || a === null) return [];   //  undefined or null, ret []
      if (Array.isArray(a)) return a;                 //  isArray, return it
    }
    return Array.prototype.slice.call(arguments);     //return array with copy of all arguments
  }

  return ensureArray;
}));


},{}],2:[function(require,module,exports){
/*
 (c) 2015, Vladimir Agafonkin
 RBush, a JavaScript library for high-performance 2D spatial indexing of points and rectangles.
 https://github.com/mourner/rbush
*/

(function () {
'use strict';

function rbush(maxEntries, format) {

    // jshint newcap: false, validthis: true
    if (!(this instanceof rbush)) return new rbush(maxEntries, format);

    // max entries in a node is 9 by default; min node fill is 40% for best performance
    this._maxEntries = Math.max(4, maxEntries || 9);
    this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));

    if (format) {
        this._initFormat(format);
    }

    this.clear();
}

rbush.prototype = {

    all: function () {
        return this._all(this.data, []);
    },

    search: function (bbox) {

        var node = this.data,
            result = [],
            toBBox = this.toBBox;

        if (!intersects(bbox, node.bbox)) return result;

        var nodesToSearch = [],
            i, len, child, childBBox;

        while (node) {
            for (i = 0, len = node.children.length; i < len; i++) {

                child = node.children[i];
                childBBox = node.leaf ? toBBox(child) : child.bbox;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf) result.push(child);
                    else if (contains(bbox, childBBox)) this._all(child, result);
                    else nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return result;
    },

    collides: function (bbox) {

        var node = this.data,
            toBBox = this.toBBox;

        if (!intersects(bbox, node.bbox)) return false;

        var nodesToSearch = [],
            i, len, child, childBBox;

        while (node) {
            for (i = 0, len = node.children.length; i < len; i++) {

                child = node.children[i];
                childBBox = node.leaf ? toBBox(child) : child.bbox;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf || contains(bbox, childBBox)) return true;
                    nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return false;
    },

    load: function (data) {
        if (!(data && data.length)) return this;

        if (data.length < this._minEntries) {
            for (var i = 0, len = data.length; i < len; i++) {
                this.insert(data[i]);
            }
            return this;
        }

        // recursively build the tree with the given data from stratch using OMT algorithm
        var node = this._build(data.slice(), 0, data.length - 1, 0);

        if (!this.data.children.length) {
            // save as is if tree is empty
            this.data = node;

        } else if (this.data.height === node.height) {
            // split root if trees have the same height
            this._splitRoot(this.data, node);

        } else {
            if (this.data.height < node.height) {
                // swap trees if inserted one is bigger
                var tmpNode = this.data;
                this.data = node;
                node = tmpNode;
            }

            // insert the small tree into the large tree at appropriate level
            this._insert(node, this.data.height - node.height - 1, true);
        }

        return this;
    },

    insert: function (item) {
        if (item) this._insert(item, this.data.height - 1);
        return this;
    },

    clear: function () {
        this.data = {
            children: [],
            height: 1,
            bbox: empty(),
            leaf: true
        };
        return this;
    },

    remove: function (item) {
        if (!item) return this;

        var node = this.data,
            bbox = this.toBBox(item),
            path = [],
            indexes = [],
            i, parent, index, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                index = node.children.indexOf(item);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    node.children.splice(index, 1);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && contains(node.bbox, bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = node.children[0];

            } else if (parent) { // go right
                i++;
                node = parent.children[i];
                goingUp = false;

            } else node = null; // nothing found
        }

        return this;
    },

    toBBox: function (item) { return item; },

    compareMinX: function (a, b) { return a[0] - b[0]; },
    compareMinY: function (a, b) { return a[1] - b[1]; },

    toJSON: function () { return this.data; },

    fromJSON: function (data) {
        this.data = data;
        return this;
    },

    _all: function (node, result) {
        var nodesToSearch = [];
        while (node) {
            if (node.leaf) result.push.apply(result, node.children);
            else nodesToSearch.push.apply(nodesToSearch, node.children);

            node = nodesToSearch.pop();
        }
        return result;
    },

    _build: function (items, left, right, height) {

        var N = right - left + 1,
            M = this._maxEntries,
            node;

        if (N <= M) {
            // reached leaf level; return leaf
            node = {
                children: items.slice(left, right + 1),
                height: 1,
                bbox: null,
                leaf: true
            };
            calcBBox(node, this.toBBox);
            return node;
        }

        if (!height) {
            // target height of the bulk-loaded tree
            height = Math.ceil(Math.log(N) / Math.log(M));

            // target number of root entries to maximize storage utilization
            M = Math.ceil(N / Math.pow(M, height - 1));
        }

        node = {
            children: [],
            height: height,
            bbox: null,
            leaf: false
        };

        // split the items into M mostly square tiles

        var N2 = Math.ceil(N / M),
            N1 = N2 * Math.ceil(Math.sqrt(M)),
            i, j, right2, right3;

        multiSelect(items, left, right, N1, this.compareMinX);

        for (i = left; i <= right; i += N1) {

            right2 = Math.min(i + N1 - 1, right);

            multiSelect(items, i, right2, N2, this.compareMinY);

            for (j = i; j <= right2; j += N2) {

                right3 = Math.min(j + N2 - 1, right2);

                // pack each entry recursively
                node.children.push(this._build(items, j, right3, height - 1));
            }
        }

        calcBBox(node, this.toBBox);

        return node;
    },

    _chooseSubtree: function (bbox, node, level, path) {

        var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

        while (true) {
            path.push(node);

            if (node.leaf || path.length - 1 === level) break;

            minArea = minEnlargement = Infinity;

            for (i = 0, len = node.children.length; i < len; i++) {
                child = node.children[i];
                area = bboxArea(child.bbox);
                enlargement = enlargedArea(bbox, child.bbox) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            }

            node = targetNode;
        }

        return node;
    },

    _insert: function (item, level, isNode) {

        var toBBox = this.toBBox,
            bbox = isNode ? item.bbox : toBBox(item),
            insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        var node = this._chooseSubtree(bbox, this.data, level, insertPath);

        // put the item into the node
        node.children.push(item);
        extend(node.bbox, bbox);

        // split on node overflow; propagate upwards if necessary
        while (level >= 0) {
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                level--;
            } else break;
        }

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    },

    // split overflowed node into two
    _split: function (insertPath, level) {

        var node = insertPath[level],
            M = node.children.length,
            m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        var splitIndex = this._chooseSplitIndex(node, m, M);

        var newNode = {
            children: node.children.splice(splitIndex, node.children.length - splitIndex),
            height: node.height,
            bbox: null,
            leaf: false
        };

        if (node.leaf) newNode.leaf = true;

        calcBBox(node, this.toBBox);
        calcBBox(newNode, this.toBBox);

        if (level) insertPath[level - 1].children.push(newNode);
        else this._splitRoot(node, newNode);
    },

    _splitRoot: function (node, newNode) {
        // split root node
        this.data = {
            children: [node, newNode],
            height: node.height + 1,
            bbox: null,
            leaf: false
        };
        calcBBox(this.data, this.toBBox);
    },

    _chooseSplitIndex: function (node, m, M) {

        var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

        minOverlap = minArea = Infinity;

        for (i = m; i <= M - m; i++) {
            bbox1 = distBBox(node, 0, i, this.toBBox);
            bbox2 = distBBox(node, i, M, this.toBBox);

            overlap = intersectionArea(bbox1, bbox2);
            area = bboxArea(bbox1) + bboxArea(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index;
    },

    // sorts node children by the best axis for split
    _chooseSplitAxis: function (node, m, M) {

        var compareMinX = node.leaf ? this.compareMinX : compareNodeMinX,
            compareMinY = node.leaf ? this.compareMinY : compareNodeMinY,
            xMargin = this._allDistMargin(node, m, M, compareMinX),
            yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY
        if (xMargin < yMargin) node.children.sort(compareMinX);
    },

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin: function (node, m, M, compare) {

        node.children.sort(compare);

        var toBBox = this.toBBox,
            leftBBox = distBBox(node, 0, m, toBBox),
            rightBBox = distBBox(node, M - m, M, toBBox),
            margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
            i, child;

        for (i = m; i < M - m; i++) {
            child = node.children[i];
            extend(leftBBox, node.leaf ? toBBox(child) : child.bbox);
            margin += bboxMargin(leftBBox);
        }

        for (i = M - m - 1; i >= m; i--) {
            child = node.children[i];
            extend(rightBBox, node.leaf ? toBBox(child) : child.bbox);
            margin += bboxMargin(rightBBox);
        }

        return margin;
    },

    _adjustParentBBoxes: function (bbox, path, level) {
        // adjust bboxes along the given tree path
        for (var i = level; i >= 0; i--) {
            extend(path[i].bbox, bbox);
        }
    },

    _condense: function (path) {
        // go through the path, removing empty nodes and updating bboxes
        for (var i = path.length - 1, siblings; i >= 0; i--) {
            if (path[i].children.length === 0) {
                if (i > 0) {
                    siblings = path[i - 1].children;
                    siblings.splice(siblings.indexOf(path[i]), 1);

                } else this.clear();

            } else calcBBox(path[i], this.toBBox);
        }
    },

    _initFormat: function (format) {
        // data format (minX, minY, maxX, maxY accessors)

        // uses eval-type function compilation instead of just accepting a toBBox function
        // because the algorithms are very sensitive to sorting functions performance,
        // so they should be dead simple and without inner calls

        // jshint evil: true

        var compareArr = ['return a', ' - b', ';'];

        this.compareMinX = new Function('a', 'b', compareArr.join(format[0]));
        this.compareMinY = new Function('a', 'b', compareArr.join(format[1]));

        this.toBBox = new Function('a', 'return [a' + format.join(', a') + '];');
    }
};


// calculate node's bbox from bboxes of its children
function calcBBox(node, toBBox) {
    node.bbox = distBBox(node, 0, node.children.length, toBBox);
}

// min bounding rectangle of node children from k to p-1
function distBBox(node, k, p, toBBox) {
    var bbox = empty();

    for (var i = k, child; i < p; i++) {
        child = node.children[i];
        extend(bbox, node.leaf ? toBBox(child) : child.bbox);
    }

    return bbox;
}

function empty() { return [Infinity, Infinity, -Infinity, -Infinity]; }

function extend(a, b) {
    a[0] = Math.min(a[0], b[0]);
    a[1] = Math.min(a[1], b[1]);
    a[2] = Math.max(a[2], b[2]);
    a[3] = Math.max(a[3], b[3]);
    return a;
}

function compareNodeMinX(a, b) { return a.bbox[0] - b.bbox[0]; }
function compareNodeMinY(a, b) { return a.bbox[1] - b.bbox[1]; }

function bboxArea(a)   { return (a[2] - a[0]) * (a[3] - a[1]); }
function bboxMargin(a) { return (a[2] - a[0]) + (a[3] - a[1]); }

function enlargedArea(a, b) {
    return (Math.max(b[2], a[2]) - Math.min(b[0], a[0])) *
           (Math.max(b[3], a[3]) - Math.min(b[1], a[1]));
}

function intersectionArea(a, b) {
    var minX = Math.max(a[0], b[0]),
        minY = Math.max(a[1], b[1]),
        maxX = Math.min(a[2], b[2]),
        maxY = Math.min(a[3], b[3]);

    return Math.max(0, maxX - minX) *
           Math.max(0, maxY - minY);
}

function contains(a, b) {
    return a[0] <= b[0] &&
           a[1] <= b[1] &&
           b[2] <= a[2] &&
           b[3] <= a[3];
}

function intersects(a, b) {
    return b[0] <= a[2] &&
           b[1] <= a[3] &&
           b[2] >= a[0] &&
           b[3] >= a[1];
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

function multiSelect(arr, left, right, n, compare) {
    var stack = [left, right],
        mid;

    while (stack.length) {
        right = stack.pop();
        left = stack.pop();

        if (right - left <= n) continue;

        mid = left + Math.ceil((right - left) / n / 2) * n;
        select(arr, left, right, mid, compare);

        stack.push(left, mid, mid, right);
    }
}

// Floyd-Rivest selection algorithm:
// sort an array between left and right (inclusive) so that the smallest k elements come first (unordered)
function select(arr, left, right, k, compare) {
    var n, i, z, s, sd, newLeft, newRight, t, j;

    while (right > left) {
        if (right - left > 600) {
            n = right - left + 1;
            i = k - left + 1;
            z = Math.log(n);
            s = 0.5 * Math.exp(2 * z / 3);
            sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (i - n / 2 < 0 ? -1 : 1);
            newLeft = Math.max(left, Math.floor(k - i * s / n + sd));
            newRight = Math.min(right, Math.floor(k + (n - i) * s / n + sd));
            select(arr, newLeft, newRight, k, compare);
        }

        t = arr[k];
        i = left;
        j = right;

        swap(arr, left, k);
        if (compare(arr[right], t) > 0) swap(arr, left, right);

        while (i < j) {
            swap(arr, i, j);
            i++;
            j--;
            while (compare(arr[i], t) < 0) i++;
            while (compare(arr[j], t) > 0) j--;
        }

        if (compare(arr[left], t) === 0) swap(arr, left, j);
        else {
            j++;
            swap(arr, j, right);
        }

        if (j <= k) left = j + 1;
        if (k <= j) right = j - 1;
    }
}

function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}


// export as AMD/CommonJS module or global variable
if (typeof define === 'function' && define.amd) define('rbush', function () { return rbush; });
else if (typeof module !== 'undefined') module.exports = rbush;
else if (typeof self !== 'undefined') self.rbush = rbush;
else window.rbush = rbush;

})();

},{}],3:[function(require,module,exports){
!function() {
  var topojson = {
    version: "1.6.19",
    mesh: function(topology) { return object(topology, meshArcs.apply(this, arguments)); },
    meshArcs: meshArcs,
    merge: function(topology) { return object(topology, mergeArcs.apply(this, arguments)); },
    mergeArcs: mergeArcs,
    feature: featureOrCollection,
    neighbors: neighbors,
    presimplify: presimplify
  };

  function stitchArcs(topology, arcs) {
    var stitchedArcs = {},
        fragmentByStart = {},
        fragmentByEnd = {},
        fragments = [],
        emptyIndex = -1;

    // Stitch empty arcs first, since they may be subsumed by other arcs.
    arcs.forEach(function(i, j) {
      var arc = topology.arcs[i < 0 ? ~i : i], t;
      if (arc.length < 3 && !arc[1][0] && !arc[1][1]) {
        t = arcs[++emptyIndex], arcs[emptyIndex] = i, arcs[j] = t;
      }
    });

    arcs.forEach(function(i) {
      var e = ends(i),
          start = e[0],
          end = e[1],
          f, g;

      if (f = fragmentByEnd[start]) {
        delete fragmentByEnd[f.end];
        f.push(i);
        f.end = end;
        if (g = fragmentByStart[end]) {
          delete fragmentByStart[g.start];
          var fg = g === f ? f : f.concat(g);
          fragmentByStart[fg.start = f.start] = fragmentByEnd[fg.end = g.end] = fg;
        } else {
          fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
        }
      } else if (f = fragmentByStart[end]) {
        delete fragmentByStart[f.start];
        f.unshift(i);
        f.start = start;
        if (g = fragmentByEnd[start]) {
          delete fragmentByEnd[g.end];
          var gf = g === f ? f : g.concat(f);
          fragmentByStart[gf.start = g.start] = fragmentByEnd[gf.end = f.end] = gf;
        } else {
          fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
        }
      } else {
        f = [i];
        fragmentByStart[f.start = start] = fragmentByEnd[f.end = end] = f;
      }
    });

    function ends(i) {
      var arc = topology.arcs[i < 0 ? ~i : i], p0 = arc[0], p1;
      if (topology.transform) p1 = [0, 0], arc.forEach(function(dp) { p1[0] += dp[0], p1[1] += dp[1]; });
      else p1 = arc[arc.length - 1];
      return i < 0 ? [p1, p0] : [p0, p1];
    }

    function flush(fragmentByEnd, fragmentByStart) {
      for (var k in fragmentByEnd) {
        var f = fragmentByEnd[k];
        delete fragmentByStart[f.start];
        delete f.start;
        delete f.end;
        f.forEach(function(i) { stitchedArcs[i < 0 ? ~i : i] = 1; });
        fragments.push(f);
      }
    }

    flush(fragmentByEnd, fragmentByStart);
    flush(fragmentByStart, fragmentByEnd);
    arcs.forEach(function(i) { if (!stitchedArcs[i < 0 ? ~i : i]) fragments.push([i]); });

    return fragments;
  }

  function meshArcs(topology, o, filter) {
    var arcs = [];

    if (arguments.length > 1) {
      var geomsByArc = [],
          geom;

      function arc(i) {
        var j = i < 0 ? ~i : i;
        (geomsByArc[j] || (geomsByArc[j] = [])).push({i: i, g: geom});
      }

      function line(arcs) {
        arcs.forEach(arc);
      }

      function polygon(arcs) {
        arcs.forEach(line);
      }

      function geometry(o) {
        if (o.type === "GeometryCollection") o.geometries.forEach(geometry);
        else if (o.type in geometryType) geom = o, geometryType[o.type](o.arcs);
      }

      var geometryType = {
        LineString: line,
        MultiLineString: polygon,
        Polygon: polygon,
        MultiPolygon: function(arcs) { arcs.forEach(polygon); }
      };

      geometry(o);

      geomsByArc.forEach(arguments.length < 3
          ? function(geoms) { arcs.push(geoms[0].i); }
          : function(geoms) { if (filter(geoms[0].g, geoms[geoms.length - 1].g)) arcs.push(geoms[0].i); });
    } else {
      for (var i = 0, n = topology.arcs.length; i < n; ++i) arcs.push(i);
    }

    return {type: "MultiLineString", arcs: stitchArcs(topology, arcs)};
  }

  function mergeArcs(topology, objects) {
    var polygonsByArc = {},
        polygons = [],
        components = [];

    objects.forEach(function(o) {
      if (o.type === "Polygon") register(o.arcs);
      else if (o.type === "MultiPolygon") o.arcs.forEach(register);
    });

    function register(polygon) {
      polygon.forEach(function(ring) {
        ring.forEach(function(arc) {
          (polygonsByArc[arc = arc < 0 ? ~arc : arc] || (polygonsByArc[arc] = [])).push(polygon);
        });
      });
      polygons.push(polygon);
    }

    function exterior(ring) {
      return cartesianRingArea(object(topology, {type: "Polygon", arcs: [ring]}).coordinates[0]) > 0; // TODO allow spherical?
    }

    polygons.forEach(function(polygon) {
      if (!polygon._) {
        var component = [],
            neighbors = [polygon];
        polygon._ = 1;
        components.push(component);
        while (polygon = neighbors.pop()) {
          component.push(polygon);
          polygon.forEach(function(ring) {
            ring.forEach(function(arc) {
              polygonsByArc[arc < 0 ? ~arc : arc].forEach(function(polygon) {
                if (!polygon._) {
                  polygon._ = 1;
                  neighbors.push(polygon);
                }
              });
            });
          });
        }
      }
    });

    polygons.forEach(function(polygon) {
      delete polygon._;
    });

    return {
      type: "MultiPolygon",
      arcs: components.map(function(polygons) {
        var arcs = [];

        // Extract the exterior (unique) arcs.
        polygons.forEach(function(polygon) {
          polygon.forEach(function(ring) {
            ring.forEach(function(arc) {
              if (polygonsByArc[arc < 0 ? ~arc : arc].length < 2) {
                arcs.push(arc);
              }
            });
          });
        });

        // Stitch the arcs into one or more rings.
        arcs = stitchArcs(topology, arcs);

        // If more than one ring is returned,
        // at most one of these rings can be the exterior;
        // this exterior ring has the same winding order
        // as any exterior ring in the original polygons.
        if ((n = arcs.length) > 1) {
          var sgn = exterior(polygons[0][0]);
          for (var i = 0, t; i < n; ++i) {
            if (sgn === exterior(arcs[i])) {
              t = arcs[0], arcs[0] = arcs[i], arcs[i] = t;
              break;
            }
          }
        }

        return arcs;
      })
    };
  }

  function featureOrCollection(topology, o) {
    return o.type === "GeometryCollection" ? {
      type: "FeatureCollection",
      features: o.geometries.map(function(o) { return feature(topology, o); })
    } : feature(topology, o);
  }

  function feature(topology, o) {
    var f = {
      type: "Feature",
      id: o.id,
      properties: o.properties || {},
      geometry: object(topology, o)
    };
    if (o.id == null) delete f.id;
    return f;
  }

  function object(topology, o) {
    var absolute = transformAbsolute(topology.transform),
        arcs = topology.arcs;

    function arc(i, points) {
      if (points.length) points.pop();
      for (var a = arcs[i < 0 ? ~i : i], k = 0, n = a.length, p; k < n; ++k) {
        points.push(p = a[k].slice());
        absolute(p, k);
      }
      if (i < 0) reverse(points, n);
    }

    function point(p) {
      p = p.slice();
      absolute(p, 0);
      return p;
    }

    function line(arcs) {
      var points = [];
      for (var i = 0, n = arcs.length; i < n; ++i) arc(arcs[i], points);
      if (points.length < 2) points.push(points[0].slice());
      return points;
    }

    function ring(arcs) {
      var points = line(arcs);
      while (points.length < 4) points.push(points[0].slice());
      return points;
    }

    function polygon(arcs) {
      return arcs.map(ring);
    }

    function geometry(o) {
      var t = o.type;
      return t === "GeometryCollection" ? {type: t, geometries: o.geometries.map(geometry)}
          : t in geometryType ? {type: t, coordinates: geometryType[t](o)}
          : null;
    }

    var geometryType = {
      Point: function(o) { return point(o.coordinates); },
      MultiPoint: function(o) { return o.coordinates.map(point); },
      LineString: function(o) { return line(o.arcs); },
      MultiLineString: function(o) { return o.arcs.map(line); },
      Polygon: function(o) { return polygon(o.arcs); },
      MultiPolygon: function(o) { return o.arcs.map(polygon); }
    };

    return geometry(o);
  }

  function reverse(array, n) {
    var t, j = array.length, i = j - n; while (i < --j) t = array[i], array[i++] = array[j], array[j] = t;
  }

  function bisect(a, x) {
    var lo = 0, hi = a.length;
    while (lo < hi) {
      var mid = lo + hi >>> 1;
      if (a[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function neighbors(objects) {
    var indexesByArc = {}, // arc index -> array of object indexes
        neighbors = objects.map(function() { return []; });

    function line(arcs, i) {
      arcs.forEach(function(a) {
        if (a < 0) a = ~a;
        var o = indexesByArc[a];
        if (o) o.push(i);
        else indexesByArc[a] = [i];
      });
    }

    function polygon(arcs, i) {
      arcs.forEach(function(arc) { line(arc, i); });
    }

    function geometry(o, i) {
      if (o.type === "GeometryCollection") o.geometries.forEach(function(o) { geometry(o, i); });
      else if (o.type in geometryType) geometryType[o.type](o.arcs, i);
    }

    var geometryType = {
      LineString: line,
      MultiLineString: polygon,
      Polygon: polygon,
      MultiPolygon: function(arcs, i) { arcs.forEach(function(arc) { polygon(arc, i); }); }
    };

    objects.forEach(geometry);

    for (var i in indexesByArc) {
      for (var indexes = indexesByArc[i], m = indexes.length, j = 0; j < m; ++j) {
        for (var k = j + 1; k < m; ++k) {
          var ij = indexes[j], ik = indexes[k], n;
          if ((n = neighbors[ij])[i = bisect(n, ik)] !== ik) n.splice(i, 0, ik);
          if ((n = neighbors[ik])[i = bisect(n, ij)] !== ij) n.splice(i, 0, ij);
        }
      }
    }

    return neighbors;
  }

  function presimplify(topology, triangleArea) {
    var absolute = transformAbsolute(topology.transform),
        relative = transformRelative(topology.transform),
        heap = minAreaHeap();

    if (!triangleArea) triangleArea = cartesianTriangleArea;

    topology.arcs.forEach(function(arc) {
      var triangles = [],
          maxArea = 0,
          triangle;

      // To store each point’s effective area, we create a new array rather than
      // extending the passed-in point to workaround a Chrome/V8 bug (getting
      // stuck in smi mode). For midpoints, the initial effective area of
      // Infinity will be computed in the next step.
      for (var i = 0, n = arc.length, p; i < n; ++i) {
        p = arc[i];
        absolute(arc[i] = [p[0], p[1], Infinity], i);
      }

      for (var i = 1, n = arc.length - 1; i < n; ++i) {
        triangle = arc.slice(i - 1, i + 2);
        triangle[1][2] = triangleArea(triangle);
        triangles.push(triangle);
        heap.push(triangle);
      }

      for (var i = 0, n = triangles.length; i < n; ++i) {
        triangle = triangles[i];
        triangle.previous = triangles[i - 1];
        triangle.next = triangles[i + 1];
      }

      while (triangle = heap.pop()) {
        var previous = triangle.previous,
            next = triangle.next;

        // If the area of the current point is less than that of the previous point
        // to be eliminated, use the latter's area instead. This ensures that the
        // current point cannot be eliminated without eliminating previously-
        // eliminated points.
        if (triangle[1][2] < maxArea) triangle[1][2] = maxArea;
        else maxArea = triangle[1][2];

        if (previous) {
          previous.next = next;
          previous[2] = triangle[2];
          update(previous);
        }

        if (next) {
          next.previous = previous;
          next[0] = triangle[0];
          update(next);
        }
      }

      arc.forEach(relative);
    });

    function update(triangle) {
      heap.remove(triangle);
      triangle[1][2] = triangleArea(triangle);
      heap.push(triangle);
    }

    return topology;
  };

  function cartesianRingArea(ring) {
    var i = -1,
        n = ring.length,
        a,
        b = ring[n - 1],
        area = 0;

    while (++i < n) {
      a = b;
      b = ring[i];
      area += a[0] * b[1] - a[1] * b[0];
    }

    return area * .5;
  }

  function cartesianTriangleArea(triangle) {
    var a = triangle[0], b = triangle[1], c = triangle[2];
    return Math.abs((a[0] - c[0]) * (b[1] - a[1]) - (a[0] - b[0]) * (c[1] - a[1]));
  }

  function compareArea(a, b) {
    return a[1][2] - b[1][2];
  }

  function minAreaHeap() {
    var heap = {},
        array = [],
        size = 0;

    heap.push = function(object) {
      up(array[object._ = size] = object, size++);
      return size;
    };

    heap.pop = function() {
      if (size <= 0) return;
      var removed = array[0], object;
      if (--size > 0) object = array[size], down(array[object._ = 0] = object, 0);
      return removed;
    };

    heap.remove = function(removed) {
      var i = removed._, object;
      if (array[i] !== removed) return; // invalid request
      if (i !== --size) object = array[size], (compareArea(object, removed) < 0 ? up : down)(array[object._ = i] = object, i);
      return i;
    };

    function up(object, i) {
      while (i > 0) {
        var j = ((i + 1) >> 1) - 1,
            parent = array[j];
        if (compareArea(object, parent) >= 0) break;
        array[parent._ = i] = parent;
        array[object._ = i = j] = object;
      }
    }

    function down(object, i) {
      while (true) {
        var r = (i + 1) << 1,
            l = r - 1,
            j = i,
            child = array[j];
        if (l < size && compareArea(array[l], child) < 0) child = array[j = l];
        if (r < size && compareArea(array[r], child) < 0) child = array[j = r];
        if (j === i) break;
        array[child._ = i] = child;
        array[object._ = i = j] = object;
      }
    }

    return heap;
  }

  function transformAbsolute(transform) {
    if (!transform) return noop;
    var x0,
        y0,
        kx = transform.scale[0],
        ky = transform.scale[1],
        dx = transform.translate[0],
        dy = transform.translate[1];
    return function(point, i) {
      if (!i) x0 = y0 = 0;
      point[0] = (x0 += point[0]) * kx + dx;
      point[1] = (y0 += point[1]) * ky + dy;
    };
  }

  function transformRelative(transform) {
    if (!transform) return noop;
    var x0,
        y0,
        kx = transform.scale[0],
        ky = transform.scale[1],
        dx = transform.translate[0],
        dy = transform.translate[1];
    return function(point, i) {
      if (!i) x0 = y0 = 0;
      var x1 = (point[0] - dx) / kx | 0,
          y1 = (point[1] - dy) / ky | 0;
      point[0] = x1 - x0;
      point[1] = y1 - y0;
      x0 = x1;
      y0 = y1;
    };
  }

  function noop() {}

  if (typeof define === "function" && define.amd) define(topojson);
  else if (typeof module === "object" && module.exports) module.exports = topojson;
  else this.topojson = topojson;
}();

},{}],4:[function(require,module,exports){
(function(prototype) {

  var pixelRatio = (function(context) {
      var backingStore = context.backingStorePixelRatio ||
        context.webkitBackingStorePixelRatio ||
        context.mozBackingStorePixelRatio ||
        context.msBackingStorePixelRatio ||
        context.oBackingStorePixelRatio ||
        context.backingStorePixelRatio || 1;

      return (window.devicePixelRatio || 1) / backingStore;
    })(prototype),

    forEach = function(obj, func) {
      for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
          func(obj[p], p);
        }
      }
    },

    ratioArgs = {
      'fillRect': 'all',
      'clearRect': 'all',
      'strokeRect': 'all',
      'moveTo': 'all',
      'lineTo': 'all',
      'arc': [0,1,2],
      'arcTo': 'all',
      'bezierCurveTo': 'all',
      'isPointinPath': 'all',
      'isPointinStroke': 'all',
      'quadraticCurveTo': 'all',
      'rect': 'all',
      'translate': 'all',
      'createRadialGradient': 'all',
      'createLinearGradient': 'all'
    };

  if (pixelRatio === 1) return;

  forEach(ratioArgs, function(value, key) {
    prototype[key] = (function(_super) {
      return function() {
        var i, len,
          args = Array.prototype.slice.call(arguments);

        if (value === 'all') {
          args = args.map(function(a) {
            return a * pixelRatio;
          });
        }
        else if (Array.isArray(value)) {
          for (i = 0, len = value.length; i < len; i++) {
            args[value[i]] *= pixelRatio;
          }
        }

        return _super.apply(this, args);
      };
    })(prototype[key]);
  });

  // Stroke lineWidth adjustment
  prototype.stroke = (function(_super) {
    return function() {
      this.lineWidth *= pixelRatio;
      _super.apply(this, arguments);
      this.lineWidth /= pixelRatio;
    };
  })(prototype.stroke);

  // Text
  //
  prototype.fillText = (function(_super) {
    return function() {
      var args = Array.prototype.slice.call(arguments);

      args[1] *= pixelRatio; // x
      args[2] *= pixelRatio; // y

      this.font = this.font.replace(
        /(\d+)(px|em|rem|pt)/g,
        function(w, m, u) {
          return (m * pixelRatio) + u;
        }
      );

      _super.apply(this, args);

      this.font = this.font.replace(
        /(\d+)(px|em|rem|pt)/g,
        function(w, m, u) {
          return (m / pixelRatio) + u;
        }
      );
    };
  })(prototype.fillText);

  prototype.strokeText = (function(_super) {
    return function() {
      var args = Array.prototype.slice.call(arguments);

      args[1] *= pixelRatio; // x
      args[2] *= pixelRatio; // y

      this.font = this.font.replace(
        /(\d+)(px|em|rem|pt)/g,
        function(w, m, u) {
          return (m * pixelRatio) + u;
        }
      );

      _super.apply(this, args);

      this.font = this.font.replace(
        /(\d+)(px|em|rem|pt)/g,
        function(w, m, u) {
          return (m / pixelRatio) + u;
        }
      );
    };
  })(prototype.strokeText);
})(CanvasRenderingContext2D.prototype);
},{}],5:[function(require,module,exports){
(function(prototype) {
  prototype.getContext = (function(_super) {
    return function(type) {
      var backingStore, ratio,
        context = _super.call(this, type);

      if (this.polyfillApplied) {
        return context;
      }

      if (type === '2d') {

        backingStore = context.backingStorePixelRatio ||
          context.webkitBackingStorePixelRatio ||
          context.mozBackingStorePixelRatio ||
          context.msBackingStorePixelRatio ||
          context.oBackingStorePixelRatio ||
          context.backingStorePixelRatio || 1;

        ratio = (window.devicePixelRatio || 1) / backingStore;

        if (ratio > 1) {
          this.style.height = this.height + 'px';
          this.style.width = this.width + 'px';
          this.width *= ratio;
          this.height *= ratio;
        }

        this.polyfillApplied = true;
      }

      return context;
    };
  })(prototype.getContext);
})(HTMLCanvasElement.prototype);
},{}],6:[function(require,module,exports){
'use strict';

require('./HTMLCanvasPolyfill.js');
require('./CanvasRenderingContextPolyfill.js');

var RenderingInterface = require('./renderingInterface');
var topojson = require('topojson');
var rbush = require('rbush');
var ensureArray = require('ensure-array');

module.exports = L.TileLayer.Canvas.extend({
  options: {
    async: true
  },
  initialize: function (url, options) {
    var self = this;

    L.TileLayer.Canvas.prototype.initialize.call(this, options);

    this._tileCache = {};
    this._features = {};
    this._renderers = [];

    this.featureId = options.featureId || function (f) {
        return f.properties.id;
      }

    if (typeof(Number.prototype.toRad) === "undefined") {
      Number.prototype.toRad = function () {
        return this * Math.PI / 180;
      };
    }

    this.setUrl(url);

    this.on("tileunload", function (d) {

      // Remove feature->tile mapping from cache
      var tileKey = d.tile._tilePoint.x + ':' + d.tile._tilePoint.y;
      var layers = self._activeLayers(d.tile);

      layers.forEach(function (key) {
        var layer = d.tile._layers[key];
        for (var i = layer.features.length - 1; i >= 0; i--) {
          var feature = layer.features[i];
          var featureId = self.featureId(feature);
          if (self._features[featureId]) {
            delete self._features[featureId].tiles[tileKey];

            if (Object.keys(self._features[featureId].tiles).length === 0) {
              delete self._features[featureId];
            }
          }
        }
      });

      if (d.tile.abort) d.tile.abort();
      d.tile.abort = null;
    });
  },

  onAdd: function (map) {

    L.TileLayer.Canvas.prototype.onAdd.call(this, map);

    if (this.options.onclick && typeof this.options.onclick === 'function') {
      this.clickHandler = this.handleClick.bind(this);
      map.on('click', this.clickHandler);
    }

    if (this.options.onmousemove && typeof this.options.onmousemove === 'function') {
      this.mouseMoveHandler = this.handleMouseMove.bind(this);
      map.on('mousemove', this.mouseMoveHandler);
    }

  },

  onRemove: function (map) {

    L.TileLayer.Canvas.prototype.onRemove.call(this, map);

    if (this.clickHandler) {
      map.off('click', this.clickHandler);
    }

    map.off('click', this.clickHandler);
    if (this.mouseMoveHandler) {
      map.off('mousemove', this.mouseMoveHandler);
    }
  },

  handleClick: function (e) {
    var features = this.featuresAt(e);
    this.options.onclick(e, features, this);
  },

  handleMouseMove: function (e) {
    var features = this.featuresAt(e);
    this.options.onmousemove(e, features, this);
  },

  featuresAt: function (e) {

    var self = this;
    var startTime = performance.now();
    var key = this._getTileKey(e.latlng, map.getZoom());
    var tile = this._tiles[key];
    var pixelRatio = this._getPixelRatio(tile);
    var i;

    if (!tile) {
      return [];
    }

    if (!tile._layers) {
      return [];
    }

    var layerKeys = Object.keys(tile._layers);

    if (!tile._spatialIndex) {
      // Build spatial index using bounds of each feature in tile
      tile._spatialIndex = rbush(9);

      var elements = [];

      layerKeys.forEach(function (layer) {
        for (i = tile._layers[layer].features.length - 1; i >= 0; i--) {
          var feature = tile._layers[layer].features[i];
          feature.layer = layer;

          var indexElement = turf.extent(feature);

          // Convert feature coords to tile coords for indexing
          indexElement[0] = indexElement[0] / self.layerExtents[feature.layer] * tile.width;
          indexElement[1] = indexElement[1] / self.layerExtents[feature.layer] * tile.height;
          indexElement[2] = indexElement[2] / self.layerExtents[feature.layer] * tile.width;
          indexElement[3] = indexElement[3] / self.layerExtents[feature.layer] * tile.height;

          // Add feature to indexElement as custom data
          indexElement.push(feature);
          elements.push(indexElement);
        }
      });

      // Bulk load elements into spatial index
      tile._spatialIndex.load(elements);
    }

    var x = e.layerPoint.x - tile._leaflet_pos.x;
    var y = e.layerPoint.y - tile._leaflet_pos.y;
    x *= pixelRatio;
    y *= pixelRatio;

    var elements = tile._spatialIndex.search([x, y, x, y]);
    var features = [];

    for (var i = elements.length - 1; i >= 0; i--) {

      var feature = elements[i][4];

      // Convert tile coords to feature coords for hit testing geometry
      var x1 = x / tile.width * self.layerExtents[feature.layer];
      var y1 = y / tile.height * self.layerExtents[feature.layer];
      var pt = turf.point([x1, y1]);

      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        if (turf.inside(pt, feature)) {
          features.push(self._features[self.featureId(feature)]);
        }
      }
      else if (feature.geometry.type === 'LineString') {
        var distance = this._getDistanceFromLine(pt.geometry.coordinates, feature.geometry.coordinates);
        distance = distance / self.layerExtents[feature.layer] * tile.width;
        if (distance < 5) {
          features.push(self._features[self.featureId(feature)]);
        }
      }
    }

    //console.log('Hit test in ' + (performance.now() - startTime) + 'ms');

    return features;
  },

  _getTileKey: function (latlng, zoom) {
    var xtile = parseInt(Math.floor((latlng.lng + 180) / 360 * (1 << zoom)));
    var ytile = parseInt(Math.floor((1 - Math.log(Math.tan(latlng.lat.toRad()) + 1 / Math.cos(latlng.lat.toRad())) / Math.PI) / 2 * (1 << zoom)));
    return [xtile, ytile].join(':');
  },

  _getDistanceFromLine: function (pt, pts) {
    var min = Number.POSITIVE_INFINITY;
    if (pts && pts.length > 1) {
      pt = L.point(pt[0], pt[1]);
      for (var i = 0, l = pts.length - 1; i < l; i++) {
        var test = this._projectPointOnLineSegment(pt, pts[i], pts[i + 1]);
        if (test.distance <= min) {
          min = test.distance;
        }
      }
    }
    return min;
  },

  _projectPointOnLineSegment: function (p, r0, r1) {
    r0 = L.point(r0[0], r0[1]);
    r1 = L.point(r1[0], r1[1]);

    var lineLength = r0.distanceTo(r1);
    if (lineLength < 1) {
      return {distance: p.distanceTo(r0), coordinate: r0};
    }
    var u = ((p.x - r0.x) * (r1.x - r0.x) + (p.y - r0.y) * (r1.y - r0.y)) / Math.pow(lineLength, 2);
    if (u < 0.0000001) {
      return {distance: p.distanceTo(r0), coordinate: r0};
    }
    if (u > 0.9999999) {
      return {distance: p.distanceTo(r1), coordinate: r1};
    }
    var a = L.point(r0.x + u * (r1.x - r0.x), r0.y + u * (r1.y - r0.y));
    return {distance: p.distanceTo(a), point: a};
  },

  projector: function (tilePoint, layer, canvasSize) {
    var tilesLong = Math.pow(2, tilePoint.z);
    var sideLength = 40075016.68557849;
    var pixelsPerTile = sideLength / tilesLong;

    var x = tilePoint.x % tilesLong;
    var y = tilePoint.y % tilesLong;

    var tilePosition = {
      top: (sideLength / 2) - ((y + 1) / tilesLong * sideLength),
      left: -(sideLength / 2) + (x / tilesLong * sideLength)
    };

    tilePosition.bottom = tilePosition.top + pixelsPerTile;
    tilePosition.right = tilePosition.left + pixelsPerTile;

    return d3.geo.transform({
      point: function (lng, lat) {
        var point = L.CRS.EPSG3857.project({lat: lat, lng: lng});
        point.x = (point.x - tilePosition.left) / pixelsPerTile;
        point.y = 1 - ((point.y - tilePosition.top) / pixelsPerTile);
        point.x *= canvasSize;
        point.y *= canvasSize;
        this.stream.point(point.x, point.y);
      }
    });
  },
  clippedProjector: function (tilePoint, layer, canvasSize, pixelRatio) {
    var projector = this.projector(tilePoint, layer, canvasSize, pixelRatio);

    var clip = d3.geo.clipExtent()
      .extent([[-8, -8], [canvasSize + 8, canvasSize + 8]]);

    return {
      stream: function (s) {
        return projector.stream(clip.stream(s));
      }
    };
  },
  _fetchTile: function (tilePoint, callback) {
    var cacheKey = this._url + '@@' + JSON.stringify(tilePoint);

    if (typeof this._tileCache[cacheKey] === 'function') {
      this._tileCache[cacheKey](callback);
      //callback(null, this._tileCache[cacheKey]);
      return function () {
      };
    } else {
      var self = this;
      var url = this.getTileUrl(tilePoint);
      var callbackList = [];
      //this._tileCache[cacheKey] = function (cb) {
      //  callbackList.push(cb);
      //};
      return this.fetch(url, function (err, result) {
        if (!err) {
          result = self.parse(result);
          callbackList.forEach(function (cb) {
            cb(null, result);
          });
          //  self._tileCache[cacheKey] = function (cb) {
          //    cb(null, result);
          //  };
        }
        callback(err, result);
      });
    }
  },
  render: function (layerName, fn) {
    if (typeof fn == 'function') {
      this._renderers.push({
        layer: layerName,
        run: fn
      });
      return this;
    } else {
      var renderer = new RenderingInterface(this, layerName);
      this._renderers.push({
        layer: layerName,
        run: renderer.run.bind(renderer)
      });
      return renderer;
    }
  },
  drawData: function (canvas, tilePoint, data, callback) {
    var context = canvas.getContext('2d');

    var canvasSize = canvas.width;
    context.clearRect(0, 0, canvasSize, canvasSize);
    var pixelRatio = this._getPixelRatio(canvas);

    var paths = {};

    if (this._renderers.length) {
      var self = this;
      this._renderers.forEach(function (renderer) {
        if (!data[renderer.layer]) return;

        if (typeof paths[renderer.layer] == 'undefined') {
          paths[renderer.layer] = d3.geo.path()
            .projection(self.clippedProjector(tilePoint, renderer.layer, canvasSize, pixelRatio))
            .context(context);
        }

        renderer.run(context, data[renderer.layer].features, tilePoint, function (features) {
          if (typeof features == 'object' && !Array.isArray(features)) {
            features = [features];
          }

          context.beginPath();
          features.forEach(paths[renderer.layer]);
        });
      });
      callback();
    } else {
      callback(new Error('No renderer specified!'));
    }
  },
  drawTile: function (canvas, tilePoint, zoom) {
    if (typeof this._url === 'undefined') {
      this.tileDrawn(canvas);
      return;
    }

    var startTime = performance.now();
    var animationFrame;
    var self = this;

    this._adjustTilePoint(tilePoint);

    if (canvas._layers) {
      doDraw();
    }
    else {
      canvas.abort = this._fetchTile(tilePoint, function (err, result) {
        if (err) {
          self.tileDrawn(canvas);
          throw err;
        }
        canvas._layers = self._filterLayers(result);
        var layers = self._activeLayers(canvas);
        var tileKey = tilePoint.x + ':' + tilePoint.y;

        layers.forEach(function (key) {
          var layer = canvas._layers[key];
          for (var i = layer.features.length - 1; i >= 0; i--) {
            var feature = layer.features[i];
            var featureId = self.featureId(feature);
            if (self._features[featureId]) {
              self._features[featureId].tiles[tileKey] = true;
            }
            else {
              var tiles = {};
              tiles[tileKey] = true;
              self._features[featureId] = {
                id: featureId,
                properties: feature.properties,
                tiles: tiles
              };
            }
          }
        });

        doDraw();
      });
    }

    function doDraw() {
      var startTime = performance.now();
      var offScreenCanvas = document.createElement('canvas');

      offScreenCanvas.width = self.options.tileSize;
      offScreenCanvas.height = self.options.tileSize;

      self.drawData(offScreenCanvas, tilePoint, canvas._layers, function (err) {
        animationFrame && window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(function () {
          canvas.getContext('2d').drawImage(offScreenCanvas, 0, 0);
          self.tileDrawn(canvas);
          //console.log('Render: ' + (performance.now() - startTime) + 'ms');
        });

        if (err) {
          throw err;
        }
      });
    }
  },

  redrawTile: function (id) {
    var canvas = this._tiles[id];
    if (canvas) {
      var context = canvas.getContext('2d');
      var components = id.split(':');
      this.drawTile(canvas, {x: components[0], y: components[1]}, this._map.getZoom());
    }
  },

  redrawFeatures: function (features) {

    features = ensureArray(features);

    var self = this;
    var key;
    var tilesToRedraw = {};

    features.forEach(function (feature) {
      var featureId = feature && self.featureId(feature);
      if (!self._features[featureId]) {
        return;
      }
      var featureTiles = self._features[featureId].tiles;
      for (key in featureTiles) {
        tilesToRedraw[key] = true;
      }
    });


    for (key in tilesToRedraw) {
      self.redrawTile(key);
    }
  },


  _filterLayers: function (input) {
    if (!this.options.layers) {
      return input;
    }

    var filtered = {};
    this.options.layers.forEach(function (key) {
      filtered[key] = input[key];
    });

    return filtered;
  },

  // Return active layer names for tile
  _activeLayers: function(tile) {
    if (!this.options.layers) {
      return Object.keys(tile._layers);
    }

    var layers = [];

    for (var layer in tile._layers) {
      if (this.options.layers[layer]) {
        layers.push(layer);
      }
    }

    return layers;
  },
  _getPixelRatio: function(context) {

    var backingStore = context.backingStorePixelRatio ||
      context.webkitBackingStorePixelRatio ||
      context.mozBackingStorePixelRatio ||
      context.msBackingStorePixelRatio ||
      context.oBackingStorePixelRatio ||
      context.backingStorePixelRatio || 1;

    return (window.devicePixelRatio || 1) / backingStore;
  }
});

module.exports.json = module.exports.extend({
  fetch: function (url, callback) {
    var xhr = d3.json(url, function (err, xhrResponse) {
      callback(err, xhrResponse.response || xhrResponse);
    });

    return xhr.abort.bind(xhr);
  }
});

module.exports.geojson = module.exports.json.extend({
  parse: function (data) {
    return {geojson: data};
  }
});

module.exports.topojson = module.exports.json.extend({
  parse: function (data) {
    var layers = {};

    for (var key in data.objects) {
      layers[key] = topojson.feature(data, data.objects[key]);
    }

    return layers;
  }
});

module.exports.mvt = module.exports.extend({
  fetch: function (url, callback) {
    var xhr = d3.xhr(url)
      .responseType('arraybuffer')
      .get(function (err, xhrResponse) {
        callback(err, xhrResponse.response || xhrResponse);
      });

    return xhr.abort.bind(xhr);
  },
  parse: function (data) {
    var tile = new VectorTile(new pbf(new Uint8Array(data)));

    var layers = {};

    if (typeof this.layerExtents == 'undefined') {
      this.layerExtents = {};
    }

    for (var key in tile.layers) {
      this.layerExtents[key] = tile.layers[key].extent;
      layers[key] = tile.layers[key].toGeoJSON();
    }

    return layers;
  },
  projector: function (tilePoint, layer, canvasSize, pixelRatio) {
    var self = this;

    return d3.geo.transform({
      point: function (x, y) {
        x = x / self.layerExtents[layer] * canvasSize;
        y = y / self.layerExtents[layer] * canvasSize;

        x /= pixelRatio;
        y /= pixelRatio;

        this.stream.point(x, y);
      }
    });
  }
});

},{"./CanvasRenderingContextPolyfill.js":4,"./HTMLCanvasPolyfill.js":5,"./renderingInterface":7,"ensure-array":1,"rbush":2,"topojson":3}],7:[function(require,module,exports){
var RenderingInterface = function(layer, name){
  this.layer = layer;
  this.layerName = name;

  this.instructions = [];
  this.whereConditions = [];

  var self = this;
  Object.keys(layer.__proto__).forEach(function(key){
    self[key] = function(){
      return layer[key].apply(layer, arguments);
    };
  });
  ['render', 'data', 'mode', 'addTo'].forEach(function(key){
    self[key] = function(){
      return layer[key].apply(layer, arguments);
    };
  });
};

RenderingInterface.prototype.minZoom = function(minZoom){
  this.minZoom = minZoom;
  return this;
};
RenderingInterface.prototype.maxZoom = function(maxZoom){
  this.maxZoom = maxZoom;
  return this;
};

RenderingInterface.prototype.fill = function(color){
  this.instructions.push({
    type: 'fill',
    color: color
  });
  return this;
};
RenderingInterface.prototype.stroke = function(width, color){
  this.instructions.push({
    type: 'stroke',
    width: width,
    color: color
  });
  return this;
};

RenderingInterface.prototype.fillBy = function(property, colors, fallback){
  this.fill(function(d){
    return colors[d.properties[property]] || fallback;
  });
  return this;
};
RenderingInterface.prototype.strokeBy = function(property, strokes, fallback){
  this.stroke(function(d){
    return strokes[d.properties[property]] || fallback;
  });
  return this;
};

RenderingInterface.prototype._where = function(options){
  var field = options.field;
  var value = options.value;

  if (typeof value == 'undefined') {
    if (typeof field == 'string') {
      this.where(function(d){
        return d.properties[field] ? true : false;
      }, undefined, options.invert);
    } else if (typeof field == 'object') {
      for (var key in field) {
        this.where(key, field[key], options.invert);
      }
    } else if (typeof field == 'function') {
      if (options.invert) {
        var oldField = field;
        field = function(){
          return !oldField.apply(null, arguments);
        };
      }
      this.whereConditions.push(field);
    } else {
      throw new Error('with RenderingInterface.where(field, value) if value is undefined then field must be a string, object, or function!');
    }
  } else if (typeof value == 'string' || typeof value == 'number'){
    this.where(function(d){
      return d.properties[field] == value;
    }, undefined, options.invert);
  } else if (typeof value == 'object' && Array.isArray(value)) {
    this.where(function(d){
      return value.indexOf(d.properties[field]) != -1;
    }, undefined, options.invert);
  } else {
    throw new Error('RenderingInterface.where(field, value) cannot be called with field as type '+(typeof field)+' and value as type '+(typeof value));
  }
  return this;
};

RenderingInterface.prototype.where = function(field, value, invert){
  return this._where({field: field, value: value, invert: invert});
}
RenderingInterface.prototype.whereNot = function(field, value){
  return this._where({field: field, value: value, invert: true});
}

RenderingInterface.prototype.run = function(context, features, tile, draw){
  if (typeof this.minZoom == 'number' && tile.z < this.minZoom) return;
  if (typeof this.maxZoom == 'number' && tile.z > this.maxZoom) return;

  this.whereConditions.forEach(function(fn){
    features = features.filter(fn);
  });

  this.instructions.forEach(function(instruction){
    if (instruction.type == 'fill') {
      if (typeof instruction.color == 'string') {
        //fill all at once
        context.fillStyle = instruction.color;
        draw(features);
        context.fill();
      } else if (typeof instruction.color == 'function') {
        //fill individually
        features.forEach(function(feature){
          context.fillStyle = instruction.color(feature);
          draw(feature);
          context.fill();
        });
      } else {
        throw new Error('fill color must be string or function, is type '+(typeof instruction.color));
      }
    } else if (instruction.type == 'stroke') {
      if (typeof instruction.width == 'number' && typeof instruction.color == 'string') {
        //draw all at once
        context.lineWidth = instruction.width;
        context.strokeStyle = instruction.color;
        draw(features);
        context.stroke();
      } else if (typeof instruction.width == 'function' || typeof instruction.color == 'function') {
        //draw individually
        features.forEach(function(feature){
          var lineWidth = (typeof instruction.width == 'function') ? instruction.width(feature) : instruction.width;
          var strokeStyle = (typeof instruction.color == 'function') ? instruction.color(feature) : instruction.color;

          if (typeof instruction.color == 'undefined' && Array.isArray(lineWidth)) {
            strokeStyle = lineWidth[1];
            lineWidth = lineWidth[0];
          }

          context.lineWidth = lineWidth;
          context.strokeStyle = strokeStyle;
          draw(feature);
          context.stroke();
        });
      } else {
        throw new Error('Expected stroke(number or function, string or function) or stroke(function), got stroke('+(typeof instruction.width)+', '+(typeof instruction.color)+')');
      }
    }
  });
};

module.exports = RenderingInterface;
},{}]},{},[6])(6)
});
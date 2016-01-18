'use strict';

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
  clippedProjector: function (tilePoint, layer, canvasSize) {
    var projector = this.projector(tilePoint, layer, canvasSize);

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

    var paths = {};

    if (this._renderers.length) {
      var self = this;
      this._renderers.forEach(function (renderer) {
        if (!data[renderer.layer]) return;

        if (typeof paths[renderer.layer] == 'undefined') {
          paths[renderer.layer] = d3.geo.path()
            .projection(self.clippedProjector(tilePoint, renderer.layer, canvasSize))
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

      offScreenCanvas.width = canvas.width;
      offScreenCanvas.height = canvas.height;

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
      context.clearRect(0, 0, canvas.width, canvas.height);
      this.drawTile(canvas, {x: components[0], y: components[1]}, this._map.getZoom());
    }
  },

  clearTile: function (id) {
    var canvas = this._tiles[id];
    if (canvas) {
      var context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
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
  projector: function (tilePoint, layer, canvasSize) {
    var self = this;

    return d3.geo.transform({
      point: function (x, y) {
        x = x / self.layerExtents[layer] * canvasSize;
        y = y / self.layerExtents[layer] * canvasSize;

        this.stream.point(x, y);
      }
    });
  }
});

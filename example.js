'use strict';

var map = L.map('map', {
  center: [51.5219475, -0.0685291],
  zoom: 14
});

var baseUrl = 'https://{s}.tiles.mapbox.com/v4/mapbox.mapbox-streets-v5,mapbox.mapbox-terrain-v2/{z}/{x}/{y}.vector.pbf?access_token=pk.eyJ1Ijoicm9iaW5zdW1tZXJoaWxsIiwiYSI6IndJNjdoc1UifQ.uKj4tO3T3wlFFCwcJLJlTg';
var buildingsUrl = 'http://localhost:3000/vector-tiles/feature/building_heights/{z}/{x}/{y}.pbf';
var selectedFeature;
var hoveredFeature;

var colors = {
  land: '#FCFBE7',
  water: '#368ed9',
  grass: '#E6F2C1',
  beach: '#FFEEC7',
  park: '#DAF2C1',
  cemetery: '#D6DED2',
  wooded: '#C3D9AD',
  agriculture: '#F2E8B6',
  building: '#E4E0E0',
  hospital: 'rgb(229,198,195)',
  school: '#FFF5CC',
  sports: '#B8E6B8',
  residential: '#FCFBE7',
  commercial: '#FCFBE7',
  industrial: '#FCFBE7',
  parking: '#EEE',
  big_road: '#853A6C',
  little_road: '#853A6C'
};


function buildingColor(height) {
  return height > 200 ? "#9e0142" :
    height > 150 ? "#d53e4f" :
      height > 120 ? "#f46d43" :
        height > 100 ? "#fdae61" :
          height > 75 ? "#fee08b" :
            height > 50 ? "#fee08b" :
              height > 40 ? "#e6f598" :
                height > 20 ? "#abdda4" :
                  height > 10 ? "#66c2a5" :
                    height > 5 ? "#3288bd" :
                      height > 0 ? "#5e4fa2" : "#00cc00";
}

var baseLayer = new Hoverboard.mvt(baseUrl, {
  hidpiPolyfill: true,
  layers: ['road', 'water']
});

baseLayer
    .render('landuse')
    .minZoom(12)
    .fillBy('class', {
      agriculture: colors.grass,
      cemetery: colors.cemetery,
      college: colors.school,
      commercial: colors.industrial,
      common: colors.park,
      forest: colors.wooded,
      golf_course: colors.sports,
      grass: colors.grass,
      hospital: colors.hospital,
      industrial: colors.industrial,
      park: colors.park,
      parking: colors.parking,
      pedestrian: colors.pedestrian_fill,
      pitch: colors.sports,
      residential: colors.residential,
      school: colors.school,
      sports_center: colors.sports,
      stadium: colors.sports,
      university: colors.school,
      wood: colors.wooded
    })

  .render('hillshade')
    .fillBy('level', {
      // Hillshade is now defined by numeric shade level in v2
      94: '#f2f3f3',
      90: '#cdcdd1',
      89: '#a8a8b1',
      78: '#868592',
      67: '#646373',
      56: '#444456'
    })

  .render('contour')
    .stroke(0.6, 'rgba(20,20,35,0.3')

  .render('road')
  .where('type', ['motorway', 'trunk'])
  .stroke(1.75, 'rgba(2555, 255, 255, 0.5)')
  .stroke(0.75, colors.big_road)

  .render('road')
  .whereNot('type', ['motorway', 'trunk'])
  .stroke(1, 'rgba(255, 255, 255, 0.5)')
  .stroke(0.5, colors.little_road)

  .render('water')
    .fill(colors.water)

  .render('waterway')
    .stroke(1, colors.water)

  .addTo(map);

var buildingsLayer = new Hoverboard.mvt(buildingsUrl, {
  hidpiPolyfill: true,
  featureId: function (feature) {
    return feature.properties.id;
  },
  onclick: function (e, features, layer) {

    var oldSelectedFeature;

    if (selectedFeature && features.length === 0) {
      oldSelectedFeature = selectedFeature;
      selectedFeature = null;
      layer.redrawFeatures(oldSelectedFeature);
      return;
    }

    oldSelectedFeature = selectedFeature;
    selectedFeature = features[0];

    var oldId = oldSelectedFeature && oldSelectedFeature.properties.id;
    var newId = selectedFeature && selectedFeature.properties.id;

    if (oldId !== newId) {
      layer.redrawFeatures([oldSelectedFeature, selectedFeature]);
    }
  },

  onmousemove: function (e, features, layer) {

    if (hoveredFeature && features.length === 0) {
      var oldHoveredFeature = hoveredFeature;
      hoveredFeature = null;
      layer.redrawFeatures(oldHoveredFeature);
      return;
    }

    var oldHoveredFeature = hoveredFeature;
    hoveredFeature = features[0];

    var oldId = oldHoveredFeature? oldHoveredFeature.properties.id : null;
    var newId = hoveredFeature? hoveredFeature.properties.id : null;

    if (oldId !== newId) {
      layer.redrawFeatures([oldHoveredFeature, hoveredFeature]);
    }
  }
});

buildingsLayer
  .render('building_heights')
  .minZoom(12)
  .fill(function (d) {

    if (selectedFeature && d.properties.id === selectedFeature.properties.id) {
      return 'red';
    }

    if (hoveredFeature && d.properties.id === hoveredFeature.properties.id) {
      return 'blue';
    }

    return buildingColor(d.properties.max);
  })
  .addTo(map);
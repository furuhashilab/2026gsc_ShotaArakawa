var wms_layers = [];


        var lyr_OpenStreetMap_0 = new ol.layer.Tile({
            'title': 'OpenStreetMap',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            })
        });
var format_22_1 = new ol.format.GeoJSON();
var features_22_1 = format_22_1.readFeatures(json_22_1, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_22_1 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_22_1.addFeatures(features_22_1);
var lyr_22_1 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_22_1, 
                style: style_22_1,
                popuplayertitle: '卒論 - シート2 (2)',
                interactive: true,
                title: '<img src="styles/legend/22_1.png" /> 卒論 - シート2 (2)'
            });

lyr_OpenStreetMap_0.setVisible(true);lyr_22_1.setVisible(true);
var layersList = [lyr_OpenStreetMap_0,lyr_22_1];
lyr_22_1.set('fieldAliases', {'Name': 'Name', 'Lat': 'Lat', 'Lon': 'Lon', 'Photo': 'Photo', 'HomePage': 'HomePage', 'URL': 'URL', });
lyr_22_1.set('fieldImages', {'Name': 'TextEdit', 'Lat': 'TextEdit', 'Lon': 'TextEdit', 'Photo': 'TextEdit', 'HomePage': 'TextEdit', 'URL': 'TextEdit', });
lyr_22_1.set('fieldLabels', {'Name': 'no label', 'Lat': 'hidden field', 'Lon': 'hidden field', 'Photo': 'no label', 'HomePage': 'no label', 'URL': 'no label', });
lyr_22_1.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});

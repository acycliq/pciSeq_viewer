function dapi(cfg) {
    console.log('Doing Dapi plot');

    // Group configuration constants
    const { maxZoom, tiles, roi } = cfg;
    const map_dims = mapSize(maxZoom);

    // Calculate transformation coefficients
    const transformCoeffs = {
        a: map_dims[0] / (roi.x1 - roi.x0),
        b: -map_dims[0] / (roi.x1 - roi.x0) * roi.x0,
        c: map_dims[1] / (roi.y1 - roi.y0),
        d: -map_dims[1] / (roi.y1 - roi.y0) * roi.y0
    };

    // Create transformation for mapping ROI to display coordinates
    const t = new L.Transformation(
        transformCoeffs.a,
        transformCoeffs.b,
        transformCoeffs.c,
        transformCoeffs.d
    );

    // Calculate CRS transformation coefficients
    const crsCoeffs = {
        a_x: 256 / (256 * 2 ** maxZoom),
        c_y: 256 / (256 * 2 ** maxZoom)
    };

    // Define custom CRS
    L.CRS.MySimple = L.extend({}, L.CRS.Simple, {
        transformation: new L.Transformation(crsCoeffs.a_x, 0, crsCoeffs.c_y, 0),
    });

    // Define map bounds
    const mapBounds = L.latLngBounds(
        L.latLng(map_dims[1], map_dims[0]), // southWest
        L.latLng(0, 0)                      // northEast
    );

    // Initialize map (keeping it in global scope)
    map = L.map('mymap', {
        crs: L.CRS.MySimple,
        attributionControl: false,
        minZoom: 0,
        maxZoom,
        bounds: mapBounds,
    }).setView([map_dims[1] / 2, map_dims[0] / 2], 2);

    const baseLayers = {};
    for (const [key, value] of Object.entries(cfg.layers)) {
        baseLayers[key] = L.tileLayer(value);
    }

    const nLayers = Object.values(baseLayers).length;
    //Add control layers to map
    if (nLayers > 1) {
        L.control.layers(baseLayers, null, { collapsed: false }).addTo(map);
    }

    const selectedLayer = Object.values(baseLayers)[nLayers - 1];
    selectedLayer.addTo(map);

    function getTaxonomy(gene) {
        const glyphData = glyphMap.get(gene) || glyphMap.get('Generic');
        return glyphData.taxonomy;
    }

    function inGlyphConfig(gene) {
        return Boolean(glyphMap.get(gene));
    }

    function getGlyphName(gene) {
        const glyphData = glyphMap.get(gene) || glyphMap.get('Generic');
        return glyphData.glyphName;
    }

    function getColor(gene) {
        const glyphData = glyphMap.get(gene) || glyphMap.get('Generic');
        return glyphData.color;
    }

    function getIdentifiedType(class_name) {
        const colorData = classColorsMap.get(class_name) || classColorsMap.get('Generic');
        return colorData.IdentifiedType;
    }

    // get the svg markers (glyphs)
    const glyphs = glyphSettings();
    const glyphMap = d3.map(glyphs, function (d) {
        return d.gene;
    });

    //get the class colors
    const classColors = classColorsCodes();
    const classColorsMap = d3.map(classColors, function (d) {
        return d.className;
    });

    //calculate radius so that resulting circles will be proportional by area
    function getRadius(y) {
        const r = Math.sqrt(y / Math.PI);
        return r;
    }

    const myRenderer = L.canvas({
        padding: 0.5,
    });

    //create style, with fillColor picked from color ramp
    function style(feature) {
        return {
            radius: getRadius(feature.properties.size),
            shape: feature.properties.glyphName,
            //fillColor: "none",//getColor(feature.properties.taxonomy),
            color: feature.properties.glyphColor,
            weight: 0.85,
            opacity: 0.85,
            fillOpacity: 0.0,
            renderer: myRenderer,
        };
    }

    function getNeighbours(neighbour_array, neighbour_prob) {
        if (!neighbour_array || !neighbour_prob) {
            return [{
                Cell_Num: null,
                Prob: null,
            }];
        }

        const data = neighbour_array.map((cell, index) => ({
            Cell_Num: +cell,
            Prob: +neighbour_prob[index],
        }));

        // Sort in decreasing order of probability
        return data.sort((x, y) => d3.ascending(y.Prob, x.Prob));
    }

    function removeLayer(layer) {
        if (!layer) return;

        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
            console.log('Layer removed');
        }
    }

    function addLayer(layer) {
        if (!layer) return;

        if (!map.hasLayer(layer)) {
            layer.addTo(map);
            console.log('Layer added');
        } else {
            console.log('Layer already present');
        }
    }

    function makeLineStringFeatures(destination, origin) {
        var o = t.transform(L.point(origin)),
            fromPoint = [o.x, o.y];
        var out = {
            type: "FeatureCollection",
            features: []
        };
        for (var i = 0; i < destination.length; ++i) {
            var spot = destination[i].properties;
            var x = +spot.x,
                y = +spot.y,
                gene = spot.Gene,
                lp = t.transform(L.point([x, y])),
                toPoint = [lp.x, lp.y];
            var g = {
                "type": "LineString",
                "coordinates": [fromPoint, toPoint]
            };

            //create feature properties
            var p = {
                "gene": gene,
                "fromPoint": fromPoint,
                "toPoint": toPoint,
                "color": getColor(gene),
            };

            //create features with proper geojson structure
            out.features.push({
                "geometry": g,
                "type": "Feature",
                "properties": p
            });
        }
        return out;
    }


    // control that shows state info on hover
    var info = L.control({
        position: 'bottomleft'
    });

    info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
        this.update();
        return this._div;
    };

    function infoMsg(cellFeatures) {
        var str1 = '</div></td></tr><tr class><td nowrap><div><b>';
        var str2 = '&nbsp </b></div></td><td><div>';
        var out = '';
        var temp = [];
        var sdata = [];
        if (cellFeatures) {
            for (var i = 0; i < cellFeatures.ClassName.length; ++i) {
                temp.push({
                    ClassName: cellFeatures.ClassName[i],
                    IdentifiedType: getIdentifiedType(cellFeatures.ClassName[i]),
                    Prob: cellFeatures.Prob[i],
                })
            }

            temp = d3.nest()
                .key(function (d) {
                    return d.IdentifiedType;
                })
                .rollup(function (leaves) {
                    return d3.sum(leaves, function (d) {
                        return d.Prob;
                    })
                }).entries(temp)
                .map(function (d) {
                    return { IdentifiedType: d.key, Prob: d.value };
                });

            // sort in decreasing order
            temp.sort(function (x, y) {
                return d3.ascending(y.Prob, x.Prob);
            })

            for (var i = 0; i < temp.length; i++) {
                out += str1 + temp[i].IdentifiedType + str2 +
                    Math.floor(temp[i].Prob * 10000) / 100 + '%'
            }
        } else {
            // do nothing
        }
        return out;
    };

    // method that we will use to update the control based on feature properties passed
    info.update = function (cellFeatures) {
        var msg = infoMsg(cellFeatures);
        this._div.innerHTML = '<div class="infoTitle"><h4>Cell Info</h4><img src="https://cdn2.iconfinder.com/data/icons/snipicons/500/pin-128.png" class="ribbon"></div>' + (cellFeatures ?
            '<table style="width:110px;">' +
            '<tbody><tr style="width:110px; border-bottom:1px solid Black; font-weight: bold"><td><div><b>Class </b></div></td><td><div> Prob' +
            msg +
            '<tbody><tr style="width:110px; border-top:1px solid black;"><td><div><b>Cell Num: </b></div></td><td><div>' + cellFeatures.cell_id +
            '</div></td></tr></tbody></table>' :
            '<b>Hover over  a cell</b>'

        );
    };

    // control that shows donut chart on hover
    var summary = L.control({
        position: 'bottomright'
    });

    summary.onAdd = function (map) {
        var divhtml = dapiConfig.createDiv()
        var container = document.createElement('div');
        container.setAttribute("id", "container");
        container.innerHTML = divhtml;
        this._div = container.firstChild;
        this.update();
        return this._div;
    };


    // control that shows datatable chart on hover
    var datatable = L.control({
        position: 'bottomright'
    });

    datatable.onAdd = function (map) {
        this._div = L.DomUtil.create('table', 'display compact custom');
        this._div.id = "dtTable"
        d3.select(this._div).attr('data-page-length', '5')
        // d3.select(this._div).append('svg').attr('width', '280').attr('height', '200')
        this.update();
        return this._div;
    };

    // method that we will use to update the control based on feature properties passed
    summary.update = function (x) {
        if (x) {
            this._div.innerHTML = x.innerHTML
        }
    };

    // method that we will use to update the control based on feature properties passed
    datatable.update = function (x) {
        if (x) {
            this._div.innerHTML = x.innerHTML
        }
    };


    function createDiv() {
        // This will hold the two charts on the bottom right corner
        // lots of styling in here. Better keep these in the main html of css file
        var myDiv = "<div class='tab-pane active fade in' id='map-content'>" +
            "<div class='container-fluid'>" +
            "<div class='col-sm-12'>" +
            "<div class='row'>" +
            "<div class='myTitle' id='dtTitle' style='margin-bottom:5px'> <h4>Highlighted Cell</h4>  " +
            " <img src='https://cdn2.iconfinder.com/data/icons/snipicons/500/pin-128.png' class='ribbon'/> " +
            "</div>" +
            "<div class='row'>" +
            "<div class='col-sm-5'>" +
            "<div class='col-sm-12' style='background-color: darkgrey; padding-left: 0px'>" +
            "<table id='dtTable' class='display compact custom' data-page-length='5' width=100%'></table>" +
            "</div>" +
            "</div>" +
            "<div class='col-sm-7'>" +
            "<div class='chart-stage' style='background-color: rgba(255, 255, 255, 0.0)'> " +
            "<div class='summary' id='pie'> " +
            "<svg width='300' height='180'></svg>" +
            "</div>" +
            "</div>" +
            "</div>" +
            "</div>" +
            "</div>";

        return myDiv
    }



    var toggleMapControl = L.control({
        position: 'topright'
    });


    toggleMapControl.onAdd = function (map) {
        var div = L.DomUtil.create('div');
        div.innerHTML =
            '<div class="leaflet-control-layers leaflet-control-layers-expanded"> ' +
            '  <form> ' +
            '    <input class="leaflet-control-layers-overlays" id="command"  ' +
            '      onclick = dapiConfig.toggleMapControl.update(this.checked) type="checkbox"> ' +
            '      Hide Dapi ' +
            '    </input> ' +
            '  </form> ' +
            ' </div>';
        return div;
    };

    toggleMapControl.update = function (bool) {
        if (bool) {
            $('.leaflet-tile-container').hide();
            console.log('Background image: hidden')
        } else {
            $('.leaflet-tile-container').show();
            console.log('Background image: visible')
        }

    };


    function tree(data) {
        // makes the tree object to pass into the tree control as an overlay
        var mapper = {},
            root = {
                label: 'Cell Classes',
                selectAllCheckbox: 'Un/select all',
                children: []
            };

        for (var str of data) {
            var sep = '.', //configSettings.class_name_separator,
                splits,
                label = '';
            // let splits = str.match(/[a-zA-Z]+|[0-9]+/g), //str.split('.'),
            if (sep === '') {
                console.log('Assuming that class name is a string followed by a number, like Astro1, Astro2 etc');
                splits = str.match(/[a-zA-Z]+|[0-9]+/g) //str.split('.'),
            }
            else {
                splits = str.split(sep)
            };
            splits.reduce(myReducer(label), root)
        }

        function myReducer(label) {
            return function (parent, place, i, arr) {
                if (label) {
                    var sep = '.'; //configSettings.class_name_separator;
                    label += sep + `${place}`; // `.${place}`;
                }
                else
                    label = place;

                if (!mapper[label]) {
                    var o = { label: label };
                    o.collapsed = true;
                    if (i === arr.length - 1) {
                        o.layer = cellContainer_array.filter(d => d.name === label)[0]
                        // o.layer = masterCellContainer.getChildByName(label);
                    }
                    mapper[label] = o;
                    parent.selectAllCheckbox = true;
                    parent.children = parent.children || [];
                    parent.children.push(o)
                }
                return mapper[label];
            }
        }

        return root
    }


    function treeControl(data) {
        return L.control.layers.tree({}, tree(data), { position: 'topright' });
    }



    // add the customised control
    // customControl = L.control.custom().addTo(map);

    var dapiData = {};
    dapiData.map = map;
    dapiData.t = t;
    dapiData.style = style;
    dapiData.getTaxonomy = getTaxonomy;
    dapiData.getGlyphName = getGlyphName;
    dapiData.inGlyphConfig = inGlyphConfig;
    dapiData.getNeighbours = getNeighbours;
    dapiData.getColor = getColor;
    dapiData.getRadius = getRadius;
    dapiData.removeLayer = removeLayer;
    dapiData.addLayer = addLayer;
    dapiData.makeLineStringFeatures = makeLineStringFeatures;
    dapiData.info = info;
    dapiData.summary = summary;
    dapiData.toggleMapControl = toggleMapControl;
    dapiData.createDiv = createDiv;
    dapiData.datatable = datatable;
    // dapiData.customControl = customControl;
    dapiData.treeControl = treeControl;
    return dapiData
}

function dapiChart(config) {

    dapiConfig = dapi(config);
    var map = dapiConfig.map;
    map.whenReady(d => {
        console.log('Map is ready')
    });

    // Constants for zoom behavior
    const ZOOM_THRESHOLD = 7;

    /**
     * Handles map movement end events
     * @param {Object} config - Map configuration object
     * @returns {Function} Event handler function
     */
    function moveend(config) {
        return function (evt) {
            // Update cell container visibility
            if (masterCellContainer) {
                masterCellContainer.children.forEach(child => child.visible = true);
            }

            const currentZoom = map.getZoom();
            const isHighZoom = currentZoom >= ZOOM_THRESHOLD;

            // Toggle visibility based on zoom level
            geneContainer_array.forEach(container => {
                container.visible = !isHighZoom;
            });

            if (isHighZoom) {
                renderGlyphs(evt, config);
                refresh();
            } else {
                dapiConfig.removeLayer(geneLayers);
                geneContainer_array.forEach(container => {
                    container.visible = true;
                });
                refresh();
            }
        };
    }

    /**
     * Handles map movement start events
     */
    function movestart() {
        if (masterCellContainer) {
            masterCellContainer.children.forEach(child => child.visible = false);
        }
    }

    /**
     * Handles zoom animation end events
     */
    function zoomanim_end() {
        const dapiToggle = document.getElementById('dapiToggle');
        if (dapiToggle) {
            dapiConfig.toggleMapControl.update(dapiToggle.checked);
        }
    }

    // Attach event listeners
    map.on('moveend', moveend(config));
    map.on('movestart', movestart);
    map.on('zoomanim', zoomanim_end);
    map.on('zoomend', zoomanim_end);

    // Now add the info control  to map...
    dapiConfig.info.addTo(map);

    //...and the summary control too
    dapiConfig.summary.addTo(map);

    //... and show the legend button
    legendControl();

    //... and show the button to hide/show the dapi and the pie/info panels
    $('#hideDapiAndPanels').show();
    console.log('check boxes added');

    // Initialize cell classes first
    cellClasses = [...new Set(cellData.map(d => d.topClass))].sort();
    
    // Create containers for each cell class
    cellClasses.forEach((d, i) => {
        // make some pixiGraphics (aka containers) objects to hold the cell polygons and name them based on their short names
        // these are just empty right now, they only have a name
        var c = new PIXI.Graphics();
        c.name = d;
        c.options = [];
        c.options.minZoom = 0;  // Needed only to fool the layer tree control and prevent an error from being raised
        c.options.maxZoom = 10; // Needed only to fool the layer tree control and prevent an error from being raised
        cellContainer_array.push(c)
    });

    // that needs to be created before we do the cell polygons (Should do that in a better way, maybe inside drawCellPolugons?)
    // Add the control to switch on/off the cell polygons per class
    myTreeControl = dapiConfig.treeControl(cellClasses);
    myTreeControl.addTo(map);
    myTreeControl._checkAll();

    // Draw cell polygons
    cellPolyLayer = drawCellPolygons();
    cellPolyLayer.addTo(map);
    console.log('cellPolyLayer added to the map');

    // Draw spots
    add_spots_patched(all_geneData, map);

    // make placeholder for the coordinates control
    addControlPlaceholders(map);

    /**
     * Creates placeholder elements for map controls
     * @param {L.Map} map - The Leaflet map instance
     */
    function addControlPlaceholders(map) {
        const corners = map._controlCorners;
        const container = map._controlContainer;
        const LEAFLET_PREFIX = 'leaflet-';

        /**
         * Creates a corner div for controls
         * @param {string} vSide - Vertical position (top, bottom, verticalcenter)
         * @param {string} hSide - Horizontal position (left, right, horizontalcenter)
         */
        function createCorner(vSide, hSide) {
            const className = `${LEAFLET_PREFIX}${vSide} ${LEAFLET_PREFIX}${hSide}`;
            corners[vSide + hSide] = L.DomUtil.create('div', className, container);
        }

        // Create all required corner positions
        const positions = [
            ['verticalcenter', 'left'],
            ['verticalcenter', 'right'],
            ['verticalcenter', 'horizontalcenter'],
            ['bottom', 'horizontalcenter'],
            ['top', 'horizontalcenter']
        ];

        positions.forEach(([vSide, hSide]) => createCorner(vSide, hSide));
    }

    // Patch Leaflet Coordinates to fix longitude wrapping
    L.Control.Coordinates.include({
        _update: function(evt) {
            if (!evt?.latlng) return;

            try {
                const pos = evt.latlng;
                
                // Get the mouse location in actual coordinates
                const coords = dapiConfig.t.untransform(L.point([pos.lng, pos.lat]));
                const transformedPos = L.latLng(coords.y, coords.x);
                
                this._currentPos = transformedPos;
                this._inputY.value = L.NumberFormatter.round(pos.lng, this.options.decimals, this.options.decimalSeperator);
                this._inputX.value = L.NumberFormatter.round(pos.lat, this.options.decimals, this.options.decimalSeperator);
                this._label.innerHTML = this._createCoordinateLabel(transformedPos);
            } catch (error) {
                console.error('Error updating coordinates:', error);
            }
        }
    });

    // Add coordinates control with configuration
    L.control.coordinates({
        position: "tophorizontalcenter",
        decimals: 0,
        decimalSeperator: ".",
        labelTemplateLat: "y: {y}",
        labelTemplateLng: "x: {x}",
        enableUserInput: true,
        useDMS: false,
        useLatLngOrder: false,
        markerType: L.marker,
        markerProps: {}
    }).addTo(map);

    // Initialize UI elements visibility
    const uiElements = [
        '.uiElement.label',
        '.leaflet-bottom.leaflet-left',
        '.leaflet-bottom.leaflet-right',
        '.panelsToggle'
    ];

    // Hide initial UI elements
    uiElements.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
    });

}
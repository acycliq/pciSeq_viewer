//
// General remark. Inconsistent notation all over the place. Cell_Num and cell_id, id are the same and actually
// should be removed and replaced by label (or cell_label whatever name you decide to use)
//

// Map and rendering globals
let map;
let masterCellContainer;
let masterCellRenderer;
let masterMarkerContainer;
let masterMarkerRenderer;

// Container arrays
let cellContainer_array = [];
let geneContainer_array = [];

// Cell data and layers
let cellBoundaries;
let cellData;
let cellClasses;
let cellPolyLayer;
let cellPolygons;
let cellSpritesLayer;

// Gene data and layers
let genepanel;
let all_geneData;
let spotsIndex;  //spatial index
let geneLayers;
let geneOverlays;

// UI Controls
let dapiConfig;
let myTreeControl;
let legendWindow;
let legend_added = false;  //used to make sure the listener is attached only once
let pinnedControls = false;
let hiddenControls = false;

// Other layers
let polygonsOverlay;
let glyphToNeighbourLayer;
let nearbyCellLayer;
let dotLayer;
let myDots;
let cellWatch;  //keeps the id of the cell currently drawn on the map

// Configuration
const zoomSwitch = 1;  // determines when the glyphs will start showing up

localStorage.clear();
console.log('Local storage cleared');


// this will be watching if something has been saved to local storage. If yes then it
// triggers some action. It acts as an intermediate layer to pass communication between the datatables grid and
// the viewer. On another browser tab, user selection on the checkboxes results in data get saved on local storage.
// This is picked up here, the javacript code reads the selected values and triggers the appropriate action
var storageMonitor = function () {
    return function () {
        var state = JSON.parse(localStorage['updated_state']);
        var enter = state.enter, // data to add
            exit = state.exit;   // data to remove

        exit.forEach(d =>{
            // 1
            _removeOverlay(d);

            // 2
            var x = masterMarkerContainer.getChildByName(d);
            if (x){
                x.visible = false
            }
            else{
                console.log("Gene: " + d + " doesn't exist in the data")
            }

        });


        enter.forEach(d => {
            // 1
            _addOverlay(d);

            // 2
            if  (map.getZoom() < zoomSwitch){
                var x = masterMarkerContainer.getChildByName(d);
                if (x) {
                    x.visible = true
                } else {
                    console.log("Gene: " + d + " doesn't exist in the data")
                }
            }
        });

        masterMarkerRenderer.render(masterMarkerContainer)

    };
}();
$(window).on("storage", storageMonitor);


function getGenePanel(geneData) {
    var panel = [...new Set(geneData.map(d => d.Gene))].sort();
    console.log('Gene panel has ' + panel.length + ' genes.');

    // drop a warning if a gene is not set in the configuration file
    var cfg_genes = glyphSettings().map(d => d.gene).sort();
    var missing = panel.filter(x => !cfg_genes.includes(x));
    if (missing.length > 0) {
        console.log('Waring: These genes have not been assigned color, glyph etc in the glyphConfig.js: ' + missing);
    }

    // save the gene panel to the local storage
    sessionStorage.setItem('gene_panel', JSON.stringify(panel));
    console.log('Gene panel written to local storage')

    return panel
}


function legendControl() {
    var legendLink = document.querySelector(`#legend-link`);

    if (!legend_added) {
        legendLink.addEventListener(`click`, () => {
            // Opens the page and stores the opened window instance
            legendWindow = window.open(`./viewer/genes_datatable.html`); // <--- THAT NEEDS TO BE EXPOSED TO THE USER. MOVE I INSIDE config.js MAYBE
            // legendWindow = window.open('./viewer/genes_datatable.html', '_blank','toolbar=yes');

        });
    }
    legend_added = true;

    $('#legend').show()
    console.log('legend added')
}


function closeLegend() {
    $('#legend').hide();

    if (legendWindow) {
        legendWindow.close();

        // Preventing weird behaviors
        // legendWindow = null;
    }
}

// function truncateStr(strIn){
//     var n = 5; //DO NOT CHECK THIS IN. REVERT BACK TO n = 2
//     return myUtils().fw_stripper(strIn, n);
// }
//
// var shortNames = d3.map(classColorsCodes(), d => truncateStr(d.className))
//     .keys()
//     .filter(d => d != "Other")
//     .sort();
//
// shortNames.forEach((d, i) => {
//     // make some pixiGraphics (aka containers) objects to hold the cell polygons and name them based on their short names
//     // these are just empty right now, they only have a name
//     var c = new PIXI.Graphics();
//     c.name = d;
//     c.options = [];
//     c.options.minZoom = 0  // Needed only to fool the layer tree control and prevent an error from being raised
//     c.options.maxZoom = 10 // Needed only to fool the layer tree control and prevent an error from being raised
//     cellContainer_array.push(c)
// });

function hidePanels(bool){
    if (bool){
        $('.leaflet-bottom.leaflet-left').hide();
        $('.leaflet-bottom.leaflet-right').hide();
        hiddenControls = true
    }
    else{
        $('.leaflet-bottom.leaflet-left').show();
        $('.leaflet-bottom.leaflet-right').show();
        hiddenControls = false
    }
    console.log('Info and donut panels: hidden= ' + bool)
}

function run() {
    console.log('app starts');
    configSettings = config();
    configSettings.cellData["name"] = "cellData";
    configSettings.geneData["name"] = "geneData";
    configSettings.cellBoundaries["name"] = "cellBoundaries";

    fetcher([configSettings.cellData, configSettings.geneData, configSettings.cellBoundaries]).then(
        result => make_package(result),
        error => alert(error) // doesn't run
    );
}

const fetcher = (filenames) => {
    return Promise.all(
        filenames.map(d => d)
        // filenames.map(d => fetch(d).then(res => console.log(res.json())))
        // filenames.map(d => fetch(d).then(res => res.json()))
    )
};

function make_package(result) {
    var workPackage = result.reduce((a, b) => a.concat(b), []);
    workPackage.forEach(d => d.root_name = strip_url(d.name));
    workPackage.forEach(d => d.bytes_streamed = 0); //will keep how many bytes have been streamed
    workPackage.forEach(d => d.data = []);          //will keep the actual data from the flatfiles
    workPackage.forEach(d => d.data_length = 0);    //will keep the number of points that have been fetched
    // workPackage = d3.map(workPackage, d => d.name.split('.')[0]);
    // workPackage = workPackage.map(d => [d.name, d.download_url, d.size]);
    data_loader(workPackage);

    console.log(result)
}

function strip_url(d) {
    // if the url has / get the last substring
    fName = d.substring(d.lastIndexOf('/')+1);

    // then strip the extension and return the value
    return fName.split('.')[0]
}

function encode(url) {
    // In google cloud storage, the object must be encoded. That means / must be replaced gy %2F
    console.log('Encoding the object path of the google cloud storage url')
    if (url.startsWith('https://www.googleapis.com/storage')){
        // Split the path
        [root, fName] = url.split('/o/')

        // encode and return
        return root + '/o/' + encodeURIComponent(fName)
    }
    else {
        return url
    }

}

function postLoad(arr) {
    //Do some basic post-processing/cleaning

    // rename gene_name to Gene!!
    arr[2].forEach(obj => {obj.Gene = obj.gene_name; delete obj.gene_name});

    var _cellBoundaries = arr[0];
    //for some reason which I havent investigated, some cells do not have boundaries. Remove those cells
    var null_coords = _cellBoundaries.filter(d => {
        return d.coords === null
    });
    if (null_coords) {
        null_coords.forEach(d => {
            console.log('Cell_id: ' + d.cell_id + ' doesnt have boundaries')
        })
    }

    // If you need to remove the cells with no boundaries uncomment the line below:
    // _cellBoundaries = _cellBoundaries.filter(d => { return d.coords != null });

    var _cellData = arr[1];
    //stick the aggregated metrics
    var agg = aggregate(_cellData);
    _cellData.forEach((d, i) => {
        d.topClass = d.ClassName[maxIndex(d.Prob)]; // Keeps the class with the highest probability
        d.agg = agg[i];
    });

    // make sure the arrays are sorted by Cell_Num
    _cellData = _cellData.sort(function(a,b){return a.Cell_Num-b.Cell_Num});
    _cellBoundaries = _cellBoundaries.sort(function(a,b){return a.Cell_Num-b.Cell_Num});

    var _genepanel = getGenePanel(arr[2])

    return [_cellBoundaries, _cellData, _genepanel]
}

function maxIndex(data){
    //returns the index of the max of the input array.
    return data.reduce((iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0);
}

function aggregate(data) {
    var cellColorRamp = classColorsCodes();
    var cellColorMap = d3.map(cellColorRamp, function (d) {
        return d.className;
    });


//     for (var i = 0; i < data.length; ++i) {
//         data[i].managedData = managedData[i]
//     }
    function aggregator(data) {
        var out;
        out = d3.nest()
            .key(function (d) {
                return d.IdentifiedType;
            }) //group by IdentifiedType
            .rollup(function (leaves) {
                return {
                    Prob: d3.sum(leaves, function (d) {
                        return d.Prob;
                    }), //sum all the values with the same IdentifiedType
                    color: leaves[0].color //Get the first color code. All codes with the same IdentifiedType are the same anyway
                }
            }).entries(data)
            .map(function (d) {
                return {IdentifiedType: d.key, Prob: d.value.Prob, color: d.value.color};
            });

        // sort in decreasing order
        out.sort(function (x, y) {
            return d3.ascending(y.Prob, x.Prob);
        });

        return out
    }

    function getIdentifiedType(className){
        return cellColorMap.get(className)? cellColorMap.get(className).IdentifiedType:
            cellColorMap.get('Generic').IdentifiedType
    }

    function getColor(className){
        return cellColorMap.get(className)? cellColorMap.get(className).color:
            cellColorMap.get('Generic').color
    }

    function dataManager(data) {
        var chartData = [];
        for (var i = 0; i < data.length; ++i) {
            var temp = [];
            for (var j = 0; j < data[i].ClassName.length; ++j) {
                // console.log(data[i].ClassName[j])
                temp.push({
                    IdentifiedType: getIdentifiedType(data[i].ClassName[j]),
                    color: getColor(data[i].ClassName[j]),
                    Prob: data[i].Prob[j] ? data[i].Prob[j] : [data[i].Prob] //Maybe that one is better
                })
            }
            var agg = aggregator(temp);
            chartData.push({
                X: data[i].X,
                Y: data[i].Y,
                GeneCountTotal: data[i].CellGeneCount.reduce((a, b) => a + b, 0), //get the sum of all the elements in the array
                IdentifiedType: agg[0].IdentifiedType,
                color: agg[0].color,
                Prob: agg[0].Prob,
                // renderOrder: sectionFeatures.renderOrder(agg[0].IdentifiedType),

            })
        }

        return chartData
    }

    var aggData = dataManager(data);
    return aggData
}


function mapSide(z){
    // returns the size of the map at zoom level z.
    // Assumes that the tile is a multiple if 256px-by-256px
    return 256 * 2**z
}

function mapSize(z){
    var length = mapSide(z);
    var x_scalar = configSettings.roi.x1/Math.max(configSettings.roi.x1, configSettings.roi.y1);
    var y_scalar = configSettings.roi.y1/Math.max(configSettings.roi.x1, configSettings.roi.y1);
    return [Math.round(length*x_scalar), Math.round(length*y_scalar)]
}


// NOTES: 
// 1. paths in 'cellData', 'geneData' and 'cellBoundaries' are with respect to the location of 
//    'streaming-tsv-parser.js' 
// 2. size is the tsv size in bytes. I use os.path.getsize() to get it. Not crucial if you 
//    don't get it right, ie the full tsv will still be parsed despite this being wrong. It 
//    is used by the loading page piecharts to calc how far we are. 
// 3. roi is the image size in pixels. Leave x0 and y0 at zero and set x1 to the width and y1 to the height. 
// 4. layers is a dict. Each key/value pair contains the string (the name) of the background image and the 
//    location of the folder that the corresponding pyramid of tiles. If the tiles are stored locally, they 
//    should be kept in a folder which is served, for example next to the tsv flatfiles. The path should be 
//    in relation to the location of the index.html If you do not have a pyramid of tiles just 
//    change the link to a blind one (change the jpg extension for example or just use an empty string). 
//    The viewer should work without the dapi background though. 
//    If the dict has more than one entries then a small control with radio button will appear at the top 
//    right of the viewer to switch between different background images. 
// 5. maxZoom: maximum zoom levels. In most cases a value of 8 if good enough. If you have a big image, like 
//    full coronal section for example then a value of 10 would make sense. Note that this should be typically 
//    inline with the zoom level you used when you did 
//    the pyramid of tiles. No harm is it less. If it is greater, then for these extra zoom levels there will 
//    be no background image. 
// 6. spotSize: Scalar. Use this to adjust the screen-size of your spots before they morph into glyphs. 
//  function config() { return{
//   "cellData": {"mediaLink": "../../data/cellData_filtered.tsv", "size": "16166143"},
//   "geneData": {"mediaLink": "../../data/geneData_filtered.tsv", "size": "272965691 "},
//   "cellBoundaries": {"mediaLink": "../../data/cellBoundaries_filtered.tsv", "size": "4025461"},
//   "roi": {"x0": 0, "x1": 6431, "y0": 0, "y1": 8543}, "maxZoom": 8,
//   "layers": {
//    "empty": "",
//    "dapi from z=34": "../../data/tiles/{z}/{y}/{x}.jpg"
//   },
//   "spotSize": 0.0625} }
//

 function config() { return{
  "cellData": {"mediaLink": "https://storage.googleapis.com/aang_data/cellData_filtered_shifted.tsv", "size": "16166143"},
  "geneData": {"mediaLink": "https://storage.googleapis.com/aang_data/geneData_filtered_shifted.tsv", "size": "272965691 "},
  "cellBoundaries": {"mediaLink": "https://storage.googleapis.com/aang_data/cellBoundaries_filtered_shifted.tsv", "size": "4025461"},
  "roi": {"x0": 0, "x1": 6431, "y0": 0, "y1": 8543}, "maxZoom": 8,
  "layers": {
   // "empty": "",
   "dapi (Plane ID:0)": "https://storage.googleapis.com/aang_data/tiles/dapi_0/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:2)": "https://storage.googleapis.com/aang_data/tiles/dapi_2/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:4)": "https://storage.googleapis.com/aang_data/tiles/dapi_4/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:6)": "https://storage.googleapis.com/aang_data/tiles/dapi_6/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:8)": "https://storage.googleapis.com/aang_data/tiles/dapi_8/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:10)": "https://storage.googleapis.com/aang_data/tiles/dapi_10/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:12)": "https://storage.googleapis.com/aang_data/tiles/dapi_12/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:14)": "https://storage.googleapis.com/aang_data/tiles/dapi_14/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:16)": "https://storage.googleapis.com/aang_data/tiles/dapi_16/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:18)": "https://storage.googleapis.com/aang_data/tiles/dapi_18/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:20)": "https://storage.googleapis.com/aang_data/tiles/dapi_20/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:22)": "https://storage.googleapis.com/aang_data/tiles/dapi_22/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:24)": "https://storage.googleapis.com/aang_data/tiles/dapi_24/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:26)": "https://storage.googleapis.com/aang_data/tiles/dapi_26/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:28)": "https://storage.googleapis.com/aang_data/tiles/dapi_28/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:30)": "https://storage.googleapis.com/aang_data/tiles/dapi_30/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:32)": "https://storage.googleapis.com/aang_data/tiles/dapi_32/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:34)": "https://storage.googleapis.com/aang_data/tiles_3/dapi_34/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:36)": "https://storage.googleapis.com/aang_data/tiles/dapi_36/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:38)": "https://storage.googleapis.com/aang_data/tiles/dapi_38/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:40)": "https://storage.googleapis.com/aang_data/tiles/dapi_40/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:42)": "https://storage.googleapis.com/aang_data/tiles/dapi_42/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:44)": "https://storage.googleapis.com/aang_data/tiles/dapi_44/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:46)": "https://storage.googleapis.com/aang_data/tiles/dapi_46/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:48)": "https://storage.googleapis.com/aang_data/tiles/dapi_48/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:50)": "https://storage.googleapis.com/aang_data/tiles/dapi_50/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:52)": "https://storage.googleapis.com/aang_data/tiles/dapi_52/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:54)": "https://storage.googleapis.com/aang_data/tiles/dapi_54/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:56)": "https://storage.googleapis.com/aang_data/tiles/dapi_56/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:58)": "https://storage.googleapis.com/aang_data/tiles/dapi_58/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:60)": "https://storage.googleapis.com/aang_data/tiles/dapi_60/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:62)": "https://storage.googleapis.com/aang_data/tiles/dapi_62/{z}/{y}/{x}.jpg",
   "dapi (Plane ID:64)": "https://storage.googleapis.com/aang_data/tiles/dapi_64/{z}/{y}/{x}.jpg",

   // "dapi (Plane ID:14)": "https://storage.googleapis.com/aang_data/tiles/dapi_14/{z}/{y}/{x}.jpg",
   // "dapi (Plane ID:54)": "https://storage.googleapis.com/aang_data/tiles/dapi_54/{z}/{y}/{x}.jpg",
   "dapi (master:34)": "https://storage.googleapis.com/aang_data/tiles/dapi_34/{z}/{y}/{x}.jpg",
  },
  "spotSize": 0.0625} }


  // "cellData": {"mediaLink": "../../data/cellData_filtered.tsv", "size": "16166143"},
  // "geneData": {"mediaLink": "../../data/geneData_filtered.tsv", "size": "272965691 "},
  // "cellBoundaries": {"mediaLink": "../../data/cellBoundaries_filtered.tsv", "size": "4025461"},

  // "cellData": {"mediaLink": "https://storage.googleapis.com/aang_data/cellData_filtered.tsv", "size": "16166143"},
  // "geneData": {"mediaLink": "https://storage.googleapis.com/aang_data/geneData_filtered.tsv", "size": "272965691 "},
  // "cellBoundaries": {"mediaLink": "https://storage.googleapis.com/aang_data/cellBoundaries_filtered.tsv", "size": "4025461"},


